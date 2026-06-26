import type { PublicItem, Snapshot } from "@/telegram/types";

const STOP = new Set([
  "que",
  "donde",
  "como",
  "cual",
  "cuales",
  "hay",
  "los",
  "las",
  "del",
  "para",
  "con",
  "una",
  "uno",
  "por",
  "qué",
  "dónde",
  "cómo",
  "the",
  "and",
  "está",
  "estan",
  "este",
  "esta",
  "esto",
  "tengo",
  "necesito",
  "puedo",
]);

export function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Recorta sufijos de plural/género para que una keyword en plural ("edificios",
// "desaparecidos") matchee datos en singular u otro género ("edificio",
// "desaparecida"). Solo se aplica a palabras suficientemente largas para no
// generar raíces ambiguas.
function stem(w: string): string {
  if (w.length < 5) return w;
  for (const suf of ["os", "as", "es"]) {
    if (w.endsWith(suf)) return w.slice(0, -2);
  }
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function keywords(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem);
}

// Señales léxicas que delatan a qué categoría apunta la pregunta. Se evalúan
// sobre la pregunta normalizada COMPLETA (no sobre las keywords filtradas),
// porque varias señales ("necesito") son stopwords para el scoring.
const CATEGORY_SIGNALS: Record<string, string[]> = {
  desaparecidos: [
    "desaparecid",
    "perdid",
    "buscando",
    "busco",
    "localizar",
    "paradero",
    "encontrar",
  ],
  acopios: [
    "acopio",
    "donar",
    "donacion",
    "donativo",
    "recolecta",
    "entregar",
    "llevar",
    "colaborar",
  ],
  edificios: [
    "edificio",
    "residencia",
    "torre",
    "colaps",
    "grieta",
    "estructura",
    "inmueble",
    "vivienda",
  ],
  solicitudes: [
    "solicit",
    "necesit",
    "requier",
    "hace falta",
    "urge",
    "ayuda con",
  ],
  reportes: [
    "noticia",
    "reporte",
    "cifra",
    "muert",
    "fallecid",
    "herid",
    "balance",
    "victima",
  ],
};

function inferCategories(question: string): Set<string> {
  const q = normalize(question);
  const hit = new Set<string>();
  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
    if (signals.some((s) => q.includes(s))) hit.add(cat);
  }
  return hit;
}

// Una coincidencia en el título o la ubicación es mucho más significativa que
// una mención de pasada en el cuerpo del texto.
const FIELD_WEIGHT = { titulo: 6, ubicacion: 4, status: 2, texto: 2 } as const;

function scoreFields(it: PublicItem, kws: string[]): number {
  const fields: Array<[number, string]> = [
    [FIELD_WEIGHT.titulo, normalize(it.titulo)],
    [FIELD_WEIGHT.ubicacion, normalize(it.ubicacion?.nombre ?? "")],
    [FIELD_WEIGHT.status, normalize(it.status ?? "")],
    [FIELD_WEIGHT.texto, normalize(it.texto)],
  ];
  let score = 0;
  for (const [weight, text] of fields) {
    if (!text) continue;
    for (const kw of kws) if (text.includes(kw)) score += weight;
  }
  return score;
}

export function retrieve(
  question: string,
  snap: Snapshot,
  k = 15,
): PublicItem[] {
  const kws = keywords(question);
  if (kws.length === 0) return [];
  const targetCats = inferCategories(question);
  // Las palabras que dispararon la categoría ("desaparecidos", "edificios") no
  // discriminan DENTRO de esa categoría: todos los ítems la cumplen. Las
  // quitamos del ranking léxico para que mande el término real ("guaira").
  const signals = [...targetCats].flatMap((c) => CATEGORY_SIGNALS[c]);
  const rankKws = signals.length
    ? kws.filter(
        (kw) => !signals.some((s) => kw.startsWith(s) || s.startsWith(kw)),
      )
    : kws;
  const scored: Array<{ item: PublicItem; score: number; target: boolean }> =
    [];
  for (const items of Object.values(snap.categories)) {
    for (const item of items) {
      // Los ítems marcados como no confiables por el enrichment no se ofrecen
      // al modelo: evita que el bot cite reportes falsos o de troleo.
      if (item.trust === "sospechoso") continue;
      const score = scoreFields(item, rankKws);
      const target = targetCats.has(item.category);
      // Un ítem sin ninguna coincidencia léxica solo se considera si pertenece
      // a la categoría que pide la pregunta (p.ej. "¿dónde hay acopios?" debe
      // devolver acopios aunque su ficha no repita la palabra "acopio").
      if (score === 0 && !target) continue;
      scored.push({ item, score, target });
    }
  }
  // Prioridad dura: cuando la pregunta apunta a una categoría, sus ítems van
  // antes que los de otras categorías (un tweet de 'reportes' que menciona la
  // ubicación de pasada no debe tapar las fichas reales). Dentro de cada grupo
  // se ordena por score y, a igualdad, por recencia (orden estable del snapshot).
  scored.sort((a, b) => {
    if (targetCats.size > 0 && a.target !== b.target) return a.target ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    // A igualdad de score, preferir el canónico del cluster sobre sus duplicados
    // y, luego, lo más corroborado (mayor nº de fuentes).
    const ca = a.item.isCanonical ? 1 : 0;
    const cb = b.item.isCanonical ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (b.item.sourcesCount ?? 0) - (a.item.sourcesCount ?? 0);
  });
  return selectWithQuota(scored, k).map((s) => s.item);
}

// Una categoría no debe copar todos los cupos cuando hay empates masivos
// (p.ej. 'reportes', la más grande): reservamos espacio para otras categorías
// relevantes. Si no hay suficiente diversidad, una segunda pasada rellena los
// cupos restantes con los mejores que quedaron, sin desperdiciar lugares.
const MAX_CATEGORY_FRACTION = 0.7;

function selectWithQuota<T extends { item: PublicItem }>(
  sorted: T[],
  k: number,
): T[] {
  const cap = Math.max(1, Math.ceil(k * MAX_CATEGORY_FRACTION));
  const perCat = new Map<string, number>();
  const picked: T[] = [];
  const leftovers: T[] = [];
  for (const s of sorted) {
    if (picked.length >= k) break;
    const used = perCat.get(s.item.category) ?? 0;
    if (used < cap) {
      perCat.set(s.item.category, used + 1);
      picked.push(s);
    } else {
      leftovers.push(s);
    }
  }
  for (const s of leftovers) {
    if (picked.length >= k) break;
    picked.push(s);
  }
  return picked;
}

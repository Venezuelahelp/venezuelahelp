import { geoCell } from "@/enrichment/geoCell";
import type { EnrichmentConfig, StoredItem } from "@/shared/types";

const STOP = new Set([
  "que",
  "los",
  "las",
  "del",
  "para",
  "con",
  "una",
  "uno",
  "por",
  "en",
  "de",
  "el",
  "la",
  "se",
  "su",
  "al",
  "lo",
  "es",
  "un",
]);

export function normalizeText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Firma de un título: palabras significativas (≥4 letras, sin stopwords),
// deduplicadas y ordenadas para que la comparación sea estable.
export function titleSignature(titulo: string): string[] {
  return [
    ...new Set(
      normalizeText(titulo)
        .split(" ")
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  ].sort();
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// Categorías donde la ubicación física ES la identidad del ítem.
const GEO_IDENTITY = new Set(["edificios", "acopios"]);

// Partes significativas (≥3 letras) de un nombre de persona normalizado.
function nameTokens(person: string): string[] {
  return person.split(" ").filter((w) => w.length >= 3);
}

// Clave única por ítem: no agrupa con ningún otro.
function uniqueKey(item: StoredItem): string {
  return `u:${item.sourceId}#${item.externalId}`;
}

// Clave base de agrupación, antes del refuerzo difuso. La señal de identidad
// depende de la categoría:
//  - desaparecidos: el NOMBRE de la persona (su título).
//  - edificios/acopios: la ubicación + título (la entidad es un lugar físico).
//  - reportes/solicitudes: el TEXTO. El título suele ser el nombre del medio o
//    de la cuenta (p. ej. "RTVC Noticias"), no el hecho, así que agrupar por
//    título uniría noticias distintas del mismo emisor.
export function baseKey(item: StoredItem, cfg: EnrichmentConfig): string {
  const cell = item.ubicacion
    ? geoCell(item.ubicacion.lat, item.ubicacion.lng, cfg.geoCellSize)
    : "";

  if (item.category === "desaparecidos") {
    const person = normalizeText(item.titulo);
    // Un nombre con < 2 partes (vacío o una sola palabra) es demasiado ambiguo
    // para afirmar que dos fichas son la misma persona.
    if (nameTokens(person).length < 2) return uniqueKey(item);
    return `p:${person}|${cell}`;
  }

  if (GEO_IDENTITY.has(item.category)) {
    const sig = titleSignature(item.titulo);
    if (sig.length >= 2) return `g:${cell}|${sig.join("-")}`;
    // Título pobre: si hay ubicación con nombre de zona, agrupamos por zona;
    // si no, queda aislado.
    if (item.ubicacion)
      return `g:${cell}|${normalizeText(item.ubicacion.nombre ?? "")}`;
    return uniqueKey(item);
  }

  // reportes, solicitudes → firma del texto (con refuerzo Jaccard).
  const sig = titleSignature(item.texto);
  // Textos muy cortos/genéricos (< 3 tokens) no identifican un hecho.
  if (sig.length < 3) return uniqueKey(item);
  return `t:${sig.join("-")}`;
}

export function clusterize(
  items: StoredItem[],
  cfg: EnrichmentConfig,
): Map<string, StoredItem[]> {
  // 1) agrupación exacta por clave base
  const base = new Map<string, StoredItem[]>();
  for (const it of items) {
    const k = baseKey(it, cfg);
    const bucket = base.get(k);
    if (bucket) bucket.push(it);
    else base.set(k, [it]);
  }

  // 2) refuerzo Jaccard SOLO entre claves de tipo título ("t:") que no agruparon
  // por geo/persona. Union-find: se funde la clave j en la i si la similitud de
  // sus firmas supera el umbral. Orden estable (índices ascendentes).
  const keys = [...base.keys()];
  const titleKeys = keys.filter((k) => k.startsWith("t:"));
  const parent = new Map<string, string>(keys.map((k) => [k, k]));
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  for (let i = 0; i < titleKeys.length; i += 1) {
    for (let j = i + 1; j < titleKeys.length; j += 1) {
      const sigI = titleKeys[i].slice(2).split("-").filter(Boolean);
      const sigJ = titleKeys[j].slice(2).split("-").filter(Boolean);
      if (jaccard(sigI, sigJ) >= cfg.jaccardThreshold) {
        parent.set(find(titleKeys[j]), find(titleKeys[i]));
      }
    }
  }

  const merged = new Map<string, StoredItem[]>();
  for (const [k, list] of base) {
    const root = find(k);
    const bucket = merged.get(root);
    if (bucket) bucket.push(...list);
    else merged.set(root, [...list]);
  }
  return merged;
}

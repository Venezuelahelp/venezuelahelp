import { normalizeText } from "@/enrichment/cluster";
import type {
  LocatedClass,
  LocatedMatch,
  LocatedSignal,
  StoredItem,
} from "@/shared/types";

// Status (ya normalizados con normalizeText) que indican que la persona fue
// hallada / está a salvo / ingresada en un centro de salud.
const LOCATED = new Set([
  "encontrado",
  "encontrada",
  "safe",
  "a salvo",
  "ingresado",
  "ingresada",
  "atendido",
  "atendida",
  "localizado",
  "localizada",
]);
// Status (normalizados) que indican que la familia sigue buscando.
const SEARCHING = new Set([
  "no encontrado", // "no_encontrado" → normalizeText colapsa el "_" a espacio
  "missing",
  "buscando",
  "familia buscando",
  "sin familia localizada",
  "por localizar",
]);
// Excluidos del cruce (fallecidos): anunciar un fallecimiento por homónimo es
// un riesgo que no se asume.
const EXCLUDED = new Set([
  "deceased",
  "fallecido",
  "fallecida",
  "muerto",
  "muerta",
]);
// Fuentes cuyo default (status vacío) es "buscando".
const SEARCH_DEFAULT_SOURCES = new Set([
  "venezuela-te-busca",
  "terremotovenezuela",
]);

export function classifyLocated(item: StoredItem): LocatedClass {
  const raw = (item.status ?? "").trim();
  if (raw === "") {
    return SEARCH_DEFAULT_SOURCES.has(item.sourceId) ? "buscando" : "otro";
  }
  const norm = normalizeText(raw);
  if (EXCLUDED.has(norm)) return "otro";
  if (LOCATED.has(norm)) return "localizado";
  if (SEARCHING.has(norm)) return "buscando";
  return "otro";
}

// Clave de nombre: tokens normalizados (>1 letra) ORDENADOS → orden-insensible
// ("Cardozo Carla" === "Carla Cardozo").
export function nameKey(titulo: string): string {
  return normalizeText(titulo)
    .split(" ")
    .filter((t) => t.length > 1)
    .sort()
    .join(" ");
}

function tokenCount(titulo: string): number {
  const k = nameKey(titulo);
  return k === "" ? 0 : k.split(" ").length;
}

// Señales duras extraídas del texto libre del ítem. Tolerantes a formato; si no
// extraen nada, simplemente no hay señal dura.
const RE_CEDULA = /\b[VvEe]?[-\s]?(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}|\d{6,9})\b/;
const RE_TELEFONO = /\b(0?4\d{2})[-\s]?(\d{7})\b/;
// "hospital" + hasta 2 palabras siguientes. Acotado para que dos textos
// distintos que citan el mismo centro produzcan la MISMA clave (consistencia
// > exhaustividad: el hospital es señal de refuerzo, no exige el nombre completo).
const RE_HOSPITAL = /hospital(?:\s+[a-z]+){1,2}/;

export function extractSignals(texto: string): {
  cedula?: string;
  telefono?: string;
  hospital?: string;
} {
  const out: { cedula?: string; telefono?: string; hospital?: string } = {};
  const t = texto ?? "";

  const ced = RE_CEDULA.exec(t);
  if (ced) {
    const digits = ced[1].replace(/\D/g, "");
    if (digits.length >= 6 && digits.length <= 9) out.cedula = digits;
  }

  const tel = RE_TELEFONO.exec(t);
  if (tel) {
    out.telefono = (tel[1].startsWith("0") ? tel[1] : "0" + tel[1]) + tel[2];
  }

  const hosp = RE_HOSPITAL.exec(normalizeText(t));
  if (hosp) out.hospital = hosp[0].trim().replace(/\s+/g, " ");

  return out;
}

const SIGNAL_RANK: Record<LocatedSignal, number> = {
  cédula: 4,
  teléfono: 3,
  hospital: 2,
  "nombre-fuerte": 1,
};

interface Indexed {
  item: StoredItem;
  signals: { cedula?: string; telefono?: string; hospital?: string };
}

// Devuelve la señal que justifica el match entre un buscado y un localizado, o
// null si no sobrevive el filtro (homónimo sin corroboración).
function matchSignal(b: Indexed, l: Indexed): LocatedSignal | null {
  if (b.signals.cedula && b.signals.cedula === l.signals.cedula)
    return "cédula";
  if (b.signals.telefono && b.signals.telefono === l.signals.telefono) {
    return "teléfono";
  }
  if (b.signals.hospital && b.signals.hospital === l.signals.hospital) {
    return "hospital";
  }
  // Nombre fuerte cross-source: 3+ tokens y distinta fuente.
  if (tokenCount(b.item.titulo) >= 3 && b.item.sourceId !== l.item.sourceId) {
    return "nombre-fuerte";
  }
  return null;
}

export function matchLocated(desaparecidos: StoredItem[]): LocatedMatch[] {
  const located: Indexed[] = [];
  const buscando: Indexed[] = [];
  for (const it of desaparecidos) {
    if (!it.titulo || nameKey(it.titulo) === "") continue;
    const cls = classifyLocated(it);
    const entry: Indexed = { item: it, signals: extractSignals(it.texto) };
    if (cls === "localizado") located.push(entry);
    else if (cls === "buscando") buscando.push(entry);
  }

  // Índice de localizados por clave de nombre.
  const byName = new Map<string, Indexed[]>();
  for (const l of located) {
    const k = nameKey(l.item.titulo);
    const list = byName.get(k);
    if (list) list.push(l);
    else byName.set(k, [l]);
  }

  const out: LocatedMatch[] = [];
  for (const b of buscando) {
    const candidates = byName.get(nameKey(b.item.titulo));
    if (!candidates || candidates.length === 0) continue;

    const scored = candidates
      .map((c) => ({ c, signal: matchSignal(b, c) }))
      .filter(
        (x): x is { c: Indexed; signal: LocatedSignal } => x.signal !== null,
      );
    if (scored.length === 0) continue;

    // Corroboración: fuentes distintas que respaldan la localización.
    const sources = Array.from(new Set(scored.map((s) => s.c.item.sourceId)));

    // Canónico = señal más fuerte; a igualdad, el más reciente.
    scored.sort((a, z) => {
      const d = SIGNAL_RANK[z.signal] - SIGNAL_RANK[a.signal];
      if (d !== 0) return d;
      return (z.c.item.lastSeenAt ?? "").localeCompare(
        a.c.item.lastSeenAt ?? "",
      );
    });
    const best = scored[0];

    out.push({
      nombre: b.item.titulo,
      signal: best.signal,
      locatedSourcesCount: sources.length,
      missing: {
        sourceId: b.item.sourceId,
        texto: b.item.texto,
        status: b.item.status,
        sourceUrl: b.item.sourceUrl,
      },
      located: {
        sourceId: best.c.item.sourceId,
        texto: best.c.item.texto,
        status: best.c.item.status,
        sourceUrl: best.c.item.sourceUrl,
        hospital: best.c.signals.hospital,
        sources,
      },
    });
  }
  return out;
}

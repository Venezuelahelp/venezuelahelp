import {
  normalize,
  CAT_LABEL,
  categoryStat,
  plural,
} from "@/telegram/retrieval";
import type { PublicItem, Snapshot } from "@/telegram/types";

// Operaciones deterministas sobre el snapshot COMPLETO (ya está en memoria).
// Las usan las herramientas del agente: listar y contar no pasan por el LLM
// para los datos — solo se formatean. Así el bot puede responder "los 20
// últimos", "los nombres", "cuántos en La Guaira", etc., sobre todo el JSON.

const LIST_DEFAULT = 20;
const LIST_MAX = 40; // tope por mensaje (Telegram corta a 4096 chars)

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Solo ítems usables: no sospechosos y canónicos (evita listar duplicados).
function usable(items: PublicItem[]): PublicItem[] {
  return items.filter((i) => i.trust !== "sospechoso" && i.isCanonical !== false);
}

function matchesZona(it: PublicItem, zona: string): boolean {
  const z = normalize(zona);
  if (!z) return true;
  return normalize(
    `${it.titulo} ${it.texto} ${it.ubicacion?.nombre ?? ""}`,
  ).includes(z);
}

export interface ListArgs {
  category?: string;
  zona?: string;
  limite?: number;
}

export function listItems(
  snap: Snapshot,
  args: ListArgs,
): { category: string; total: number; page: PublicItem[] } {
  const cat =
    args.category && snap.categories[args.category] ? args.category : undefined;
  let pool = usable(
    cat
      ? (snap.categories[cat] ?? [])
      : Object.values(snap.categories).flat(),
  );
  if (args.zona) pool = pool.filter((it) => matchesZona(it, args.zona!));
  const total = pool.length;
  const limite = Math.min(Math.max(1, args.limite ?? LIST_DEFAULT), LIST_MAX);
  // El snapshot ya viene ordenado por recencia (lastSeenAt desc) por categoría.
  return { category: cat ?? "todas", total, page: pool.slice(0, limite) };
}

export function formatList(
  category: string,
  total: number,
  page: PublicItem[],
  zona?: string,
): string {
  if (page.length === 0) {
    return zona
      ? `No encontré registros en "${zona}" todavía. Prueba con otra zona o sin filtro.`
      : "No tengo registros para esa lista todavía.";
  }
  const label = cap(CAT_LABEL[category] ?? category);
  const zonaTxt = zona ? ` en ${zona}` : "";
  const lines = page.map((it, i) => {
    const loc = it.ubicacion?.nombre ? ` — ${it.ubicacion.nombre}` : "";
    return `${i + 1}. ${it.titulo}${loc}`;
  });
  const header = `📋 ${label}${zonaTxt} (mostrando ${page.length} de ${total.toLocaleString("es")}):`;
  const footer =
    total > page.length
      ? `\n\nHay más registros. Acota por zona para afinar (p. ej. "${label.toLowerCase()} en La Guaira").`
      : "";
  return `${header}\n\n${lines.join("\n")}${footer}`;
}

export interface CountArgs {
  category?: string;
  zona?: string;
}

export function countItems(snap: Snapshot, args: CountArgs): string {
  const entries = Object.entries(snap.categories) as [string, PublicItem[]][];
  const filt = (items: PublicItem[]) =>
    args.zona ? items.filter((it) => matchesZona(it, args.zona!)) : items;

  if (args.category && snap.categories[args.category]) {
    const { count, sources } = categoryStat(filt(snap.categories[args.category]));
    const label = CAT_LABEL[args.category] ?? args.category;
    const zonaTxt = args.zona ? ` en ${args.zona}` : "";
    return `Hay ${plural(count, "registro", "registros")} de ${label}${zonaTxt} en total (de ${plural(sources, "fuente", "fuentes")}).`;
  }

  const lines = entries
    .map(([cat, items]) => [cat, categoryStat(filt(items))] as const)
    .filter(([, s]) => s.count > 0)
    .map(([cat, s]) => `• ${CAT_LABEL[cat] ?? cat}: ${s.count.toLocaleString("es")}`);
  if (lines.length === 0) return "No tengo registros para ese conteo todavía.";
  const total = entries.reduce(
    (a, [, items]) => a + categoryStat(filt(items)).count,
    0,
  );
  const zonaTxt = args.zona ? ` en ${args.zona}` : "";
  return `📊 Tengo ${total.toLocaleString("es")} registros${zonaTxt}:\n${lines.join("\n")}`;
}

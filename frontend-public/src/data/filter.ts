import type { Category, Item, Snapshot, SortMode, StatusFilter } from "@/types";
import { CATEGORY_ORDER } from "./categories";
import { normalize, filterUsable, searchItems } from "@venezuelahelp/core";

export { normalize };

// Colapsa duplicados (solo canónicos) respetando el orden de categorías.
export function flatten(snap: Snapshot): Item[] {
  const result: Item[] = [];
  for (const category of CATEGORY_ORDER) {
    for (const item of filterUsable(
      snap.categories[category] ?? [],
    ) as Item[]) {
      result.push(item);
    }
  }
  return result;
}

// Filtra por categorías activas (multi-select) + sub-filtro de status
// (desaparecidos) + query con el MISMO ranking que el bot/API. Sin query,
// mantiene el orden de `flatten`. El status compara SOLO statusClass (campo
// canónico del enrichment); nunca se parsea el status crudo aquí.
export function filterItems(
  items: Item[],
  query: string,
  active: Set<Category>,
  status: StatusFilter = "todos",
): Item[] {
  const byCat =
    active.size > 0 ? items.filter((i) => active.has(i.category)) : items;
  const byStatus =
    status === "todos"
      ? byCat
      : byCat.filter(
          (i) => i.category !== "desaparecidos" || i.statusClass === status,
        );
  if (!query.trim()) return byStatus;
  // searchItems espera un Snapshot; envolvemos los ítems ya filtrados.
  const snap = {
    generatedAt: "",
    categories: groupByCategory(byStatus),
  };
  return searchItems(snap, { q: query }) as Item[];
}

// Ordenación client-side. "relevancia" preserva el orden actual (flatten /
// ranking de búsqueda); las otras copian el array (nunca mutan la entrada).
export function sortItems(items: Item[], sort: SortMode): Item[] {
  if (sort === "relevancia") return items;
  const byDate = (a: Item, b: Item) =>
    (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
  if (sort === "recientes") return [...items].sort(byDate);
  return [...items].sort((a, b) => {
    const d = (b.sourcesCount ?? 0) - (a.sourcesCount ?? 0);
    return d !== 0 ? d : byDate(a, b);
  });
}

/** Feature-detect: el snapshot vivo trae statusClass (los pre-deploy no). */
export function hasStatusClass(items: Item[]): boolean {
  return items.some((i) => i.statusClass !== undefined);
}

function groupByCategory(items: Item[]): Record<string, Item[]> {
  const out: Record<string, Item[]> = {};
  for (const it of items) (out[it.category] ??= []).push(it);
  return out;
}

/**
 * Count items per source, sorted by count descending. Used by the footer to
 * list the pages information is collected from.
 */
export function countBySource(
  items: Item[],
): { sourceId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([sourceId, count]) => ({ sourceId, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build the source list shown in the Hero counter / Footer from the snapshot's
 * source directory (the configured sources), NOT from the items. This keeps the
 * public list in sync with the admin: every configured source appears even if
 * it has no items right now, and stray sourceIds present in items but absent
 * from the directory never leak in. The item count is attached only to order
 * the list (sources with data lead) and to display in the footer.
 */
export function sourcesForDisplay(
  sourceIds: string[],
  items: Item[],
): { sourceId: string; count: number; cats: Category[] }[] {
  const stats = new Map<
    string,
    { count: number; catCounts: Map<Category, number> }
  >();
  for (const item of items) {
    let s = stats.get(item.sourceId);
    if (!s) {
      s = { count: 0, catCounts: new Map() };
      stats.set(item.sourceId, s);
    }
    s.count += 1;
    s.catCounts.set(item.category, (s.catCounts.get(item.category) ?? 0) + 1);
  }
  return sourceIds
    .map((sourceId) => {
      const s = stats.get(sourceId);
      const cats = s
        ? [...s.catCounts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
        : [];
      return { sourceId, count: s?.count ?? 0, cats };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Count items by category.
 * Returns an object with all categories initialized to 0,
 * then incremented based on items.
 */
export function countByCategory(items: Item[]): Record<Category, number> {
  const counts: Record<Category, number> = {
    reportes: 0,
    desaparecidos: 0,
    acopios: 0,
    edificios: 0,
    solicitudes: 0,
    hospitales: 0,
  };

  for (const item of items) {
    counts[item.category]++;
  }

  return counts;
}

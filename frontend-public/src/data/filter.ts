import type { Category, Item, Snapshot } from "@/types";
import { CATEGORY_ORDER } from "./categories";

/**
 * Normalize a string for accent-insensitive substring matching.
 * - Lowercase
 * - NFD decomposition + strip combining marks
 * - Collapse whitespace
 * - Trim
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Strip combining marks
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Flatten all items from a snapshot into a single array, respecting category
 * order. Colapsa duplicados: el enrichment del backend marca cada cluster (misma
 * persona/edificio/texto en una o varias fuentes) con un único canónico; el
 * público muestra SOLO los canónicos (`isCanonical !== false`) para no repetir
 * el mismo hecho. Los snapshots viejos sin marca (`isCanonical` undefined) se
 * tratan como canónicos.
 */
export function flatten(snap: Snapshot): Item[] {
  const result: Item[] = [];
  for (const category of CATEGORY_ORDER) {
    for (const item of snap.categories[category]) {
      if (item.isCanonical !== false) result.push(item);
    }
  }
  return result;
}

/**
 * Filter items by query and active categories.
 * - If active set is not empty, only items in active categories are kept.
 * - If query is not empty, only items matching normalized query are kept.
 * - Matches against: titulo + " " + texto + " " + ubicacion.nombre (if present).
 */
export function filterItems(
  items: Item[],
  query: string,
  active: Set<Category>,
): Item[] {
  return items.filter((item) => {
    // Check category filter
    if (active.size > 0 && !active.has(item.category)) {
      return false;
    }

    // Check query filter
    if (query) {
      const normalizedQuery = normalize(query);
      const searchText = normalize(
        item.titulo + " " + item.texto + " " + (item.ubicacion?.nombre ?? ""),
      );
      if (!searchText.includes(normalizedQuery)) {
        return false;
      }
    }

    return true;
  });
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
): { sourceId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.sourceId, (counts.get(item.sourceId) ?? 0) + 1);
  }
  return sourceIds
    .map((sourceId) => ({ sourceId, count: counts.get(sourceId) ?? 0 }))
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

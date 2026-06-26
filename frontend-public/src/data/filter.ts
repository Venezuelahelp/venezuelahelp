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
 * Flatten all items from a snapshot into a single array,
 * respecting category order.
 */
export function flatten(snap: Snapshot): Item[] {
  const result: Item[] = [];
  for (const category of CATEGORY_ORDER) {
    result.push(...snap.categories[category]);
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
 * Count items by category.
 * Returns an object with all 5 categories initialized to 0,
 * then incremented based on items.
 */
export function countByCategory(items: Item[]): Record<Category, number> {
  const counts: Record<Category, number> = {
    reportes: 0,
    desaparecidos: 0,
    acopios: 0,
    edificios: 0,
    solicitudes: 0,
  };

  for (const item of items) {
    counts[item.category]++;
  }

  return counts;
}

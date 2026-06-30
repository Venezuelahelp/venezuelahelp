import { normalize } from "./text";
import type { PublicItem } from "./types";

// Una coincidencia en el título o la ubicación es mucho más significativa que
// una mención de pasada en el cuerpo del texto.
export const FIELD_WEIGHT = {
  titulo: 6,
  ubicacion: 4,
  status: 2,
  texto: 2,
} as const;

export function scoreFields(it: PublicItem, kws: string[]): number {
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

// Una categoría no debe copar todos los cupos cuando hay empates masivos
// (p.ej. 'reportes', la más grande): reservamos espacio para otras categorías
// relevantes. Si no hay suficiente diversidad, una segunda pasada rellena los
// cupos restantes con los mejores que quedaron, sin desperdiciar lugares.
export const MAX_CATEGORY_FRACTION = 0.7;

export function selectWithQuota<T extends { item: PublicItem }>(
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

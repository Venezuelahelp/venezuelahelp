import { normalize } from "./text";
import type { PublicItem } from "./types";

export interface FilterOpts {
  collapseDuplicates?: boolean; // default true
  includeSuspicious?: boolean; // default false
}

// Deja solo ítems usables: excluye sospechosos y (por defecto) los duplicados no
// canónicos del cluster. Snapshots viejos sin marca (isCanonical undefined) se
// tratan como canónicos.
export function filterUsable(
  items: PublicItem[],
  opts: FilterOpts = {},
): PublicItem[] {
  const collapse = opts.collapseDuplicates !== false;
  const includeSus = opts.includeSuspicious === true;
  return items.filter((i) => {
    if (!includeSus && i.trust === "sospechoso") return false;
    if (collapse && i.isCanonical === false) return false;
    return true;
  });
}

export function matchesZona(it: PublicItem, zona: string): boolean {
  const z = normalize(zona);
  if (!z) return true;
  return normalize(
    `${it.titulo} ${it.texto} ${it.ubicacion?.nombre ?? ""}`,
  ).includes(z);
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

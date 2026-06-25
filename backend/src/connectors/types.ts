import type { NormalizedItem, GeoPoint } from "@/shared/types";

export interface SourceConnector {
  id: string;
  fetchItems(): Promise<NormalizedItem[]>;
}

export function geo(
  lat?: number | null,
  lng?: number | null,
  nombre?: string | null,
): GeoPoint | undefined {
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  return { lat, lng, ...(nombre ? { nombre } : {}) };
}

export function truncate(s: string | null | undefined, n = 500): string {
  const v = (s ?? "").toString().trim();
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

export type { NormalizedItem };

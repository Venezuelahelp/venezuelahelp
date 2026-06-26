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

// Normaliza una URL de imagen de la fuente: resuelve rutas relativas contra el
// origen y descarta valores vacíos o de esquema no http(s) (termina en un
// `<img src>` del frontend). Fase 1: referenciamos la URL, no la re-hospedamos.
export function imageUrl(
  base: string,
  url?: string | null,
): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  try {
    const resolved = new URL(url, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:")
      return undefined;
    return resolved.href;
  } catch {
    return undefined;
  }
}

export type { NormalizedItem };

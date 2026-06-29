import type { DataSnapshot } from "@/data-api/snapshot";
import type { PublicItem } from "@/telegram/types";
import { normalize } from "@/telegram/retrieval";

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

export interface QueryParams {
  category?: string;
  q?: string;
  near?: { lat: number; lng: number };
  radiusKm?: number;
  limit?: number;
  cursor?: string;
}

export interface QueryResult {
  items: PublicItem[];
  total: number;
  nextCursor?: string;
}

function haversineKm(
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

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const n = Number.parseInt(
    Buffer.from(cursor, "base64url").toString("utf-8"),
    10,
  );
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

export function queryItems(
  snapshot: DataSnapshot,
  params: QueryParams,
): QueryResult {
  let items: PublicItem[] = params.category
    ? (snapshot.categories[params.category] ?? [])
    : Object.values(snapshot.categories).flat();

  if (params.q) {
    const keywords = normalize(params.q)
      .split(" ")
      .filter((w) => w.length >= 2);
    if (keywords.length > 0) {
      items = items.filter((it) => {
        const hay = normalize(
          `${it.titulo} ${it.texto} ${it.ubicacion?.nombre ?? ""}`,
        );
        return keywords.every((k) => hay.includes(k));
      });
    }
  }

  if (params.near && params.radiusKm !== undefined) {
    const { near, radiusKm } = params;
    items = items.filter(
      (it) => it.ubicacion && haversineKm(near, it.ubicacion) <= radiusKm,
    );
  }

  const total = items.length;
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = decodeCursor(params.cursor);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : undefined;

  return { items: page, total, nextCursor };
}

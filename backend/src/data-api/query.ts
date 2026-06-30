import { searchItems } from "@venezuelahelp/core";
import type { DataSnapshot } from "@/data-api/snapshot";
import type { PublicItem } from "@/telegram/types";

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
  const items = searchItems(snapshot, {
    category: params.category,
    q: params.q,
    near: params.near,
    radiusKm: params.radiusKm,
  });
  const total = items.length;
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = decodeCursor(params.cursor);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : undefined;
  return { items: page, total, nextCursor };
}

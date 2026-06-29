import { loadSnapshot as defaultLoadSnapshot } from "@/data-api/snapshot";
import type { DataSnapshot } from "@/data-api/snapshot";
import { queryItems, type QueryParams } from "@/data-api/query";
import { logger } from "@/shared/logger";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "x-api-key,content-type",
  "access-control-allow-methods": "GET,OPTIONS",
} as const;

export interface DataApiEvent {
  requestContext: { http: { method: string } };
  rawPath: string;
  queryStringParameters?: Record<string, string | undefined>;
}

export interface DataApiDeps {
  loadSnapshot?: () => Promise<DataSnapshot>;
}

interface Result {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function json(status: number, body: unknown): Result {
  return {
    statusCode: status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseParams(
  qs: Record<string, string | undefined> = {},
): QueryParams {
  const params: QueryParams = {};
  if (qs.category) params.category = qs.category;
  if (qs.q) params.q = qs.q;
  if (qs.cursor) params.cursor = qs.cursor;
  if (qs.limit) {
    const n = Number.parseInt(qs.limit, 10);
    if (Number.isFinite(n)) params.limit = n;
  }
  if (qs.near) {
    const [lat, lng] = qs.near.split(",").map((s) => Number.parseFloat(s));
    if (Number.isFinite(lat) && Number.isFinite(lng)) params.near = { lat, lng };
  }
  if (qs.radiusKm) {
    const n = Number.parseFloat(qs.radiusKm);
    if (Number.isFinite(n)) params.radiusKm = n;
  }
  return params;
}

export async function handler(
  event: DataApiEvent,
  deps: DataApiDeps = {},
): Promise<Result> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS }, body: "" };
  }

  const load = deps.loadSnapshot ?? defaultLoadSnapshot;
  const path = event.rawPath;

  let snapshot: DataSnapshot;
  try {
    snapshot = await load();
  } catch (err) {
    logger.error("data-api: no se pudo cargar el snapshot", { err });
    return json(502, { error: "snapshot unavailable" });
  }

  if (path === "/v1/items") {
    const result = queryItems(snapshot, parseParams(event.queryStringParameters));
    return json(200, result);
  }

  if (path === "/v1/categories") {
    const counts = Object.fromEntries(
      Object.entries(snapshot.categories).map(([cat, items]) => [
        cat,
        items.length,
      ]),
    );
    return json(200, { counts, generatedAt: snapshot.generatedAt });
  }

  if (path === "/v1/sources") {
    return json(200, snapshot.sources ?? {});
  }

  if (path === "/v1/meta") {
    return json(200, { generatedAt: snapshot.generatedAt });
  }

  return json(404, { error: "not found" });
}

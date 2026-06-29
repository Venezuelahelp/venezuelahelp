import { gunzipSync } from "node:zlib";
import type { PublicItem } from "@/telegram/types";

// El snapshot del data-api se lee por HTTP desde la URL pública (igual que el
// front: fetch del snapshot.json en CloudFront), no por S3. Así no hay permisos
// S3 ni acoplamiento cross-stack; solo se le suma la capa de autorización.
export interface DataSnapshot {
  generatedAt: string;
  sources?: Record<string, { nombre: string; url?: string }>;
  categories: Record<string, PublicItem[]>;
}

const SNAPSHOT_TTL_MS = 60_000;

let cache: { at: number; data: DataSnapshot } | null = null;

export function __resetDataSnapshotCache() {
  cache = null;
}

interface Deps {
  fetch: typeof fetch;
  now: number;
}

export async function loadSnapshot(
  deps?: Partial<Deps>,
): Promise<DataSnapshot> {
  const fetcher = deps?.fetch ?? fetch;
  const now = deps?.now ?? Date.now();
  if (cache && now - cache.at < SNAPSHOT_TTL_MS) return cache.data;

  const url = process.env.SNAPSHOT_URL;
  if (!url) throw new Error("SNAPSHOT_URL no configurado");

  const res = await fetcher(url);
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);

  const bytes = Buffer.from(await res.arrayBuffer());
  // Detectamos gzip por magic bytes (1f 8b): según el cliente HTTP la respuesta
  // puede o no venir ya descomprimida.
  const isGzip = bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = (isGzip ? gunzipSync(bytes) : bytes).toString("utf-8");
  const data = JSON.parse(text) as DataSnapshot;
  cache = { at: now, data };
  return data;
}

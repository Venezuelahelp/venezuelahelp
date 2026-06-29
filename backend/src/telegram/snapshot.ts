import { gunzipSync } from "node:zlib";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Snapshot } from "@/telegram/types";

const KEY = "snapshot.json";
const SNAPSHOT_TTL_MS = 60_000;
const s3 = new S3Client({});

let cache: { at: number; data: Snapshot } | null = null;

export function __resetSnapshotCache() {
  cache = null;
}

interface Deps {
  s3: Pick<S3Client, "send">;
  now: number;
}

export async function loadSnapshot(deps?: Partial<Deps>): Promise<Snapshot> {
  const client = (deps?.s3 as Deps["s3"]) ?? s3;
  const now = deps?.now ?? Date.now();
  if (cache && now - cache.at < SNAPSHOT_TTL_MS) return cache.data;

  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.SNAPSHOT_BUCKET, Key: KEY }),
  );
  // El snapshot se escribe gzip (Content-Encoding: gzip); S3 GetObject NO lo
  // descomprime, así que lo gunzipeamos acá. Detectamos por magic bytes para
  // seguir leyendo snapshots antiguos sin comprimir.
  const bytes = Buffer.from(
    await (
      res.Body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray(),
  );
  const isGzip = bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = (isGzip ? gunzipSync(bytes) : bytes).toString("utf-8");
  const data = JSON.parse(text) as Snapshot;
  cache = { at: now, data };
  return data;
}

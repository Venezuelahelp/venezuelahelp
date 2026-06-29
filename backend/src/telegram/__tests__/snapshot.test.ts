import { describe, it, expect, beforeEach, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { loadSnapshot, __resetSnapshotCache } from "@/telegram/snapshot";

const s3Mock = mockClient(S3Client);

// Snapshot sin comprimir (bytes crudos) — compat hacia atrás.
function bodyOf(obj: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return { transformToByteArray: async () => bytes };
}

// Snapshot gzip (como lo escribe buildSnapshot en producción).
function gzBodyOf(obj: unknown) {
  return {
    transformToByteArray: async () =>
      new Uint8Array(gzipSync(JSON.stringify(obj))),
  };
}

beforeEach(() => {
  s3Mock.reset();
  __resetSnapshotCache();
  process.env.SNAPSHOT_BUCKET = "b";
});

describe("loadSnapshot", () => {
  it("fetches and parses the snapshot", async () => {
    const snap = { generatedAt: "t", categories: { reportes: [] } };
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyOf(snap) as any });
    const r = await loadSnapshot();
    expect(r.generatedAt).toBe("t");
    expect(r.categories.reportes).toEqual([]);
  });

  it("descomprime un snapshot gzip (Content-Encoding: gzip)", async () => {
    const snap = { generatedAt: "gz", categories: { reportes: [{ id: 1 }] } };
    s3Mock.on(GetObjectCommand).resolves({ Body: gzBodyOf(snap) as any });
    const r = await loadSnapshot();
    expect(r.generatedAt).toBe("gz");
    expect(r.categories.reportes).toHaveLength(1);
  });

  it("caches within TTL (only one S3 call)", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: bodyOf({ generatedAt: "t", categories: {} }) as any });
    await loadSnapshot({ now: 1000 });
    await loadSnapshot({ now: 2000 });
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
  });
});

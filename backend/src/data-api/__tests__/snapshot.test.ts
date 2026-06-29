import { describe, it, expect, beforeEach, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { loadSnapshot, __resetDataSnapshotCache } from "@/data-api/snapshot";

const snap = {
  generatedAt: "2026-06-29T00:00:00.000Z",
  sources: { sismo: { nombre: "Sismo", url: "https://s" } },
  categories: { desaparecidos: [], reportes: [] },
};

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.SNAPSHOT_URL = "https://cdn.example/snapshot.json";
  __resetDataSnapshotCache();
});

describe("data-api loadSnapshot", () => {
  it("fetches the public snapshot URL and parses it (like the front)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snap));
    const data = await loadSnapshot({ fetch: fetchMock, now: 1000 });
    expect(data.generatedAt).toBe(snap.generatedAt);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("gunzips a gzipped body (snapshot is written gzip)", async () => {
    const gz = gzipSync(Buffer.from(JSON.stringify(snap)));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => gz,
    } as unknown as Response);
    const data = await loadSnapshot({ fetch: fetchMock, now: 1000 });
    expect(data.generatedAt).toBe(snap.generatedAt);
  });

  it("caches within the TTL (no second fetch)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(snap));
    await loadSnapshot({ fetch: fetchMock, now: 1000 });
    await loadSnapshot({ fetch: fetchMock, now: 2000 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("throws on a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(
      loadSnapshot({ fetch: fetchMock, now: 1000 }),
    ).rejects.toThrow();
  });
});

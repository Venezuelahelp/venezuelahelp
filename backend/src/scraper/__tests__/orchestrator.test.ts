import { describe, it, expect, vi } from "vitest";
import { runScrape } from "@/scraper/orchestrator";
import type { Source } from "@/shared/types";

function srcRepo(sources: Source[]) {
  return {
    listEnabled: vi.fn(async () => sources),
    put: vi.fn(async () => {}),
  };
}

const ok: Source = {
  id: "ok",
  nombre: "ok",
  url: "u",
  connector: "jsonApi",
  enabled: true,
};
const bad: Source = {
  id: "bad",
  nombre: "bad",
  url: "u",
  connector: "jsonApi",
  enabled: true,
};

describe("runScrape", () => {
  it("runs the AI connector for connector:'ai' sources and persists hash/extractAt", async () => {
    const aiSrc = {
      id: "noticias",
      nombre: "N",
      url: "u",
      connector: "ai" as const,
      enabled: true,
    };
    const itemRepo = { upsert: vi.fn(async () => "created" as const) };
    const sourceRepo = {
      listEnabled: vi.fn(async () => [aiSrc]),
      put: vi.fn(async () => {}),
    };
    const runAiSource = vi.fn(async () => ({
      items: [
        {
          category: "reportes",
          sourceId: "noticias",
          externalId: "1",
          titulo: "t",
          texto: "x",
          raw: {},
        },
      ],
      nextHash: "h1",
      nextExtractAt: "2026-06-26T00:00:00Z",
      skipped: false,
    }));
    const deps = {
      sourceRepo,
      itemRepo,
      seed: vi.fn(async () => {}),
      getConnector: () => undefined,
      runAiSource,
      fetchText: vi.fn(),
      extract: vi.fn(),
    };
    const res = await runScrape("2026-06-26T00:00:00Z", deps as any);
    expect(runAiSource).toHaveBeenCalled();
    expect(itemRepo.upsert).toHaveBeenCalledTimes(1);
    const persisted = sourceRepo.put.mock.calls[0][0];
    expect(persisted).toMatchObject({
      id: "noticias",
      lastContentHash: "h1",
      lastExtractAt: "2026-06-26T00:00:00Z",
      lastStatus: "ok",
    });
  });

  it("runs the rest engine for connector:'rest' sources and persists status/lastFetched/endpointStats", async () => {
    const restSrc: Source = {
      id: "sismovenezuela",
      nombre: "S",
      url: "u",
      connector: "rest",
      rest: { base: "https://s.com", endpoints: [] },
      enabled: true,
    };
    const itemRepo = { upsert: vi.fn(async () => "created" as const) };
    const sourceRepo = {
      listEnabled: vi.fn(async () => [restSrc]),
      put: vi.fn(async () => {}),
    };
    const runRestSource = vi.fn(async () => ({
      items: [
        {
          category: "reportes" as const,
          sourceId: "sismovenezuela",
          externalId: "1",
          titulo: "t",
          texto: "x",
          raw: {},
        },
      ],
      endpointStats: [{ label: "reportes", fetched: 1 }],
    }));
    const deps = {
      sourceRepo,
      itemRepo,
      seed: vi.fn(async () => {}),
      runRestSource,
      fetchJson: vi.fn(),
    };
    await runScrape("2026-06-29T00:00:00Z", deps as any);
    expect(runRestSource).toHaveBeenCalled();
    expect(itemRepo.upsert).toHaveBeenCalledTimes(1);
    const persisted = sourceRepo.put.mock.calls[0][0];
    expect(persisted).toMatchObject({
      id: "sismovenezuela",
      status: "ok",
      lastStatus: "ok",
      lastFetched: 1,
      endpointStats: [{ label: "reportes", fetched: 1 }],
    });
  });

  it("marca error si TODOS los endpoints rest fallan (no es fallo silencioso)", async () => {
    const restSrc: Source = {
      id: "x",
      nombre: "X",
      url: "u",
      connector: "rest",
      rest: { base: "https://s.com", endpoints: [] },
      enabled: true,
    };
    const sourceRepo = {
      listEnabled: vi.fn(async () => [restSrc]),
      put: vi.fn(async () => {}),
    };
    const runRestSource = vi.fn(async () => ({
      items: [],
      endpointStats: [{ label: "reportes", fetched: 0, error: "HTML/SPA" }],
    }));
    const deps = {
      sourceRepo,
      itemRepo: { upsert: vi.fn() },
      seed: vi.fn(async () => {}),
      runRestSource,
      fetchJson: vi.fn(),
    };
    await runScrape("2026-06-29T00:00:00Z", deps as any);
    const persisted = sourceRepo.put.mock.calls[0][0];
    expect(persisted.status).toBe("error");
    expect(persisted.lastStatus).toBe("error");
  });

  it("una fuente blocked no se degrada a error", async () => {
    const blockedSrc: Source = {
      id: "b",
      nombre: "B",
      url: "u",
      connector: "rest",
      rest: { base: "https://s.com", endpoints: [] },
      enabled: true,
      status: "blocked",
    };
    const sourceRepo = {
      listEnabled: vi.fn(async () => [blockedSrc]),
      put: vi.fn(async () => {}),
    };
    const runRestSource = vi.fn(async () => ({
      items: [],
      endpointStats: [{ label: "x", fetched: 0, error: "gated" }],
    }));
    const deps = {
      sourceRepo,
      itemRepo: { upsert: vi.fn() },
      seed: vi.fn(async () => {}),
      runRestSource,
      fetchJson: vi.fn(),
    };
    await runScrape("2026-06-29T00:00:00Z", deps as any);
    const persisted = sourceRepo.put.mock.calls[0][0];
    expect(persisted.status).toBe("blocked");
  });

  it("isolates a failing source and still processes the healthy one", async () => {
    const itemRepo = { upsert: vi.fn(async () => "created" as const) };
    const deps = {
      sourceRepo: srcRepo([ok, bad]),
      itemRepo,
      seed: vi.fn(async () => {}),
      getConnector: (id: string) =>
        id === "ok"
          ? {
              id,
              fetchItems: async () => [
                {
                  category: "reportes",
                  sourceId: id,
                  externalId: "1",
                  titulo: "t",
                  texto: "x",
                  raw: {},
                },
              ],
            }
          : {
              id,
              fetchItems: async () => {
                throw new Error("boom");
              },
            },
    };
    const results = await runScrape("2026-06-25T00:00:00Z", deps as any);
    const okRes = results.find((r) => r.sourceId === "ok")!;
    const badRes = results.find((r) => r.sourceId === "bad")!;
    expect(okRes.created).toBe(1);
    expect(badRes.error).toMatch(/boom/);
    expect(itemRepo.upsert).toHaveBeenCalledTimes(1);
    // estado persistido para ambas fuentes
    expect(deps.sourceRepo.put).toHaveBeenCalledTimes(2);
  });
});

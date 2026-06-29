import { describe, it, expect, vi, beforeEach } from "vitest";
import { route, type RouteDeps } from "@/admin-api/router";

const mockConfig = {
  scrapeRateMin: 30,
  bedrockModelId: "amazon.nova-lite-v1:0",
  systemPrompt: "Eres un asistente.",
  botTriggerMode: "mention" as const,
};

const mockSource = {
  id: "src-1",
  nombre: "Fuente 1",
  url: "https://example.com",
  connector: "jsonApi" as const,
  enabled: true,
  lastRun: "2024-01-01T00:00:00Z",
  lastStatus: "ok" as const,
};

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    configRepo: {
      get: vi.fn().mockResolvedValue(mockConfig),
      put: vi.fn().mockResolvedValue(undefined),
    },
    sourceRepo: {
      list: vi.fn().mockResolvedValue([mockSource]),
      get: vi.fn().mockResolvedValue(mockSource),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    itemRepo: {
      listByCategory: vi.fn().mockResolvedValue([]),
    },
    invokeScraper: vi.fn().mockResolvedValue(undefined),
    visitRepo: {
      analytics: vi.fn().mockResolvedValue({
        kpis: { today: 1, last7: 2, last30: 3 },
        byCountry: [{ key: "VE", count: 3 }],
        byBrowser: [{ key: "Chrome", count: 3 }],
        byDevice: [{ key: "mobile", count: 3 }],
        recent: [],
      }),
    },
    tgUserRepo: {
      list: vi.fn().mockResolvedValue([
        {
          chatId: 7,
          username: "ana",
          firstName: "Ana",
          lastName: "P",
          languageCode: "es",
          firstSeenAt: "2026-06-01T00:00:00Z",
          lastSeenAt: "2026-06-26T00:00:00Z",
          msgCount: 4,
        },
      ]),
    },
    ...overrides,
  };
}

describe("admin-api router", () => {
  describe("GET /config", () => {
    it("returns 200 with config from configRepo.get()", async () => {
      const deps = makeDeps();
      const result = await route("GET", "/config", null, deps);
      expect(result.status).toBe(200);
      expect(result.body).toEqual(mockConfig);
      expect(deps.configRepo.get).toHaveBeenCalledOnce();
    });
  });

  describe("PUT /config", () => {
    it("returns 200 with parsed config when body is valid", async () => {
      const deps = makeDeps();
      const validBody = {
        scrapeRateMin: 60,
        bedrockModelId: "amazon.nova-lite-v1:0",
        systemPrompt: "Updated prompt",
        botTriggerMode: "all",
      };
      const result = await route("PUT", "/config", validBody, deps);
      expect(result.status).toBe(200);
      expect(result.body).toEqual(validBody);
      expect(deps.configRepo.put).toHaveBeenCalledWith(validBody);
    });

    it("returns 400 with issues when body is invalid", async () => {
      const deps = makeDeps();
      const invalidBody = {
        scrapeRateMin: 2, // below min 5
        bedrockModelId: "", // empty string
        systemPrompt: "", // empty string
        botTriggerMode: "invalid-mode", // not in enum
      };
      const result = await route("PUT", "/config", invalidBody, deps);
      expect(result.status).toBe(400);
      expect(result.body).toHaveProperty("error");
      expect(result.body).toHaveProperty("issues");
      expect(deps.configRepo.put).not.toHaveBeenCalled();
    });

    it("returns 400 when scrapeRateMin exceeds 1440", async () => {
      const deps = makeDeps();
      const invalidBody = {
        scrapeRateMin: 1500,
        bedrockModelId: "some-model",
        systemPrompt: "Valid prompt",
        botTriggerMode: "command",
      };
      const result = await route("PUT", "/config", invalidBody, deps);
      expect(result.status).toBe(400);
    });
  });

  describe("GET /sources", () => {
    it("returns 200 with list from sourceRepo.list()", async () => {
      const deps = makeDeps();
      const result = await route("GET", "/sources", null, deps);
      expect(result.status).toBe(200);
      expect(result.body).toEqual([mockSource]);
      expect(deps.sourceRepo.list).toHaveBeenCalledOnce();
    });
  });

  describe("PATCH /sources/{id}", () => {
    it("returns 200 with updated source when source is found", async () => {
      const deps = makeDeps();
      const result = await route(
        "PATCH",
        "/sources/src-1",
        { enabled: false },
        deps,
      );
      expect(result.status).toBe(200);
      expect(deps.sourceRepo.get).toHaveBeenCalledWith("src-1");
      expect(deps.sourceRepo.put).toHaveBeenCalledWith({
        ...mockSource,
        enabled: false,
      });
      expect((result.body as typeof mockSource).enabled).toBe(false);
    });

    it("returns 404 when source is not found", async () => {
      const deps = makeDeps({
        sourceRepo: {
          list: vi.fn().mockResolvedValue([]),
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      });
      const result = await route(
        "PATCH",
        "/sources/nonexistent",
        { enabled: true },
        deps,
      );
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ error: "source not found" });
      expect(deps.sourceRepo.put).not.toHaveBeenCalled();
    });

    it("returns 400 when body enabled is not boolean", async () => {
      const deps = makeDeps();
      const result = await route(
        "PATCH",
        "/sources/src-1",
        { enabled: "yes" },
        deps,
      );
      expect(result.status).toBe(400);
    });
  });

  describe("POST /scrape", () => {
    it("calls invokeScraper and returns 202 with {started:true}", async () => {
      const deps = makeDeps();
      const result = await route("POST", "/scrape", null, deps);
      expect(result.status).toBe(202);
      expect(result.body).toEqual({ started: true });
      expect(deps.invokeScraper).toHaveBeenCalledOnce();
    });
  });

  describe("GET /stats", () => {
    it("returns 200 with counts per category and sources summary", async () => {
      const itemsMock = [
        {
          id: "i1",
          category: "reportes",
          sourceId: "src-1",
          externalId: "e1",
          titulo: "T",
          texto: "X",
          raw: {},
          contentHash: "h",
          firstSeenAt: "2024-01-01",
          lastSeenAt: "2024-01-01",
        },
        {
          id: "i2",
          category: "reportes",
          sourceId: "src-1",
          externalId: "e2",
          titulo: "T2",
          texto: "X2",
          raw: {},
          contentHash: "h2",
          firstSeenAt: "2024-01-01",
          lastSeenAt: "2024-01-01",
        },
      ];
      const deps = makeDeps({
        itemRepo: {
          listByCategory: vi.fn().mockImplementation((cat) => {
            if (cat === "reportes") return Promise.resolve(itemsMock);
            return Promise.resolve([]);
          }),
        },
      });

      const result = await route("GET", "/stats", null, deps);
      expect(result.status).toBe(200);
      const body = result.body as {
        counts: Record<string, number>;
        sources: unknown[];
      };
      expect(body.counts).toMatchObject({
        reportes: 2,
        desaparecidos: 0,
        acopios: 0,
        edificios: 0,
        solicitudes: 0,
      });
      expect(body.sources).toHaveLength(1);
      expect(body.sources[0]).toMatchObject({
        id: "src-1",
        nombre: "Fuente 1",
        enabled: true,
        connector: "jsonApi",
        lastRun: "2024-01-01T00:00:00Z",
        lastStatus: "ok",
      });
    });
  });

  describe("POST /sources", () => {
    it("POST /sources creates an AI source with a slug id", async () => {
      const sourceRepo = {
        list: vi.fn(),
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
        delete: vi.fn(),
      };
      const res = await route(
        "POST",
        "/sources",
        {
          nombre: "Noticias VE",
          url: "https://news.example/ve",
          extractHint: "acopios",
        },
        { sourceRepo } as any,
      );
      expect(res.status).toBe(201);
      const put = sourceRepo.put.mock.calls[0][0];
      expect(put).toMatchObject({
        id: "noticias-ve",
        nombre: "Noticias VE",
        url: "https://news.example/ve",
        connector: "ai",
        enabled: true,
        extractHint: "acopios",
      });
    });

    it("POST /sources appends -2 when the slug already exists", async () => {
      const sourceRepo = {
        list: vi.fn(),
        get: vi.fn(async (id: string) =>
          id === "noticias-ve" ? { id } : null,
        ),
        put: vi.fn(async () => {}),
        delete: vi.fn(),
      };
      const res = await route(
        "POST",
        "/sources",
        { nombre: "Noticias VE", url: "https://news.example/ve" },
        { sourceRepo } as any,
      );
      expect(res.status).toBe(201);
      expect(sourceRepo.put.mock.calls[0][0].id).toBe("noticias-ve-2");
    });

    it("POST /sources rejects an invalid url with 400", async () => {
      const sourceRepo = {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
      };
      const res = await route(
        "POST",
        "/sources",
        { nombre: "x", url: "no-es-url" },
        { sourceRepo } as any,
      );
      expect(res.status).toBe(400);
    });

    it("POST /sources rejects an SSRF url (private/metadata host) with 400", async () => {
      const sourceRepo = {
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
      };
      const res = await route(
        "POST",
        "/sources",
        { nombre: "x", url: "http://169.254.169.254/latest/meta-data/" },
        { sourceRepo } as any,
      );
      expect(res.status).toBe(400);
      expect(sourceRepo.put).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /sources/{id}", () => {
    it("DELETE /sources/{id} deletes", async () => {
      const sourceRepo = {
        delete: vi.fn(async () => {}),
        get: vi.fn(),
        put: vi.fn(),
        list: vi.fn(),
      };
      const res = await route("DELETE", "/sources/noticias-ve", undefined, {
        sourceRepo,
      } as any);
      expect(res.status).toBe(200);
      expect(sourceRepo.delete).toHaveBeenCalledWith("noticias-ve");
    });
  });

  describe("GET /analytics", () => {
    it("returns 200 with analytics from visitRepo.analytics()", async () => {
      const deps = makeDeps();
      const result = await route("GET", "/analytics", null, deps);
      expect(result.status).toBe(200);
      expect(deps.visitRepo.analytics).toHaveBeenCalledOnce();
      expect(result.body).toHaveProperty("kpis");
      expect((result.body as any).kpis.last30).toBe(3);
    });
  });

  describe("GET /tg-users", () => {
    it("returns 200 with a shaped user list (nombre joined)", async () => {
      const deps = makeDeps();
      const result = await route("GET", "/tg-users", null, deps);
      expect(result.status).toBe(200);
      expect(deps.tgUserRepo.list).toHaveBeenCalledOnce();
      const body = result.body as any[];
      expect(body[0]).toMatchObject({
        chatId: 7,
        username: "ana",
        nombre: "Ana P",
        msgCount: 4,
      });
    });
  });

  const validRest = {
    base: "https://api.example.com",
    endpoints: [
      {
        label: "reportes",
        url: "https://api.example.com/api/reports",
        category: "reportes" as const,
        itemsPath: "data",
        shape: "array" as const,
        fieldMap: { externalId: "id", titulo: "title" },
      },
    ],
  };

  describe("POST /sources (tipo rest)", () => {
    it("crea una fuente rest con connector:'rest' y su config", async () => {
      const deps = makeDeps({
        sourceRepo: {
          list: vi.fn(),
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn(),
        },
      });
      const result = await route(
        "POST",
        "/sources",
        {
          tipo: "rest",
          nombre: "Mi API",
          url: "https://example.com",
          rest: validRest,
        },
        deps,
      );
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({
        connector: "rest",
        nombre: "Mi API",
        rest: { endpoints: [{ label: "reportes" }] },
      });
    });

    it("rechaza un endpoint con host privado (SSRF) con 400", async () => {
      const deps = makeDeps();
      const result = await route(
        "POST",
        "/sources",
        {
          tipo: "rest",
          nombre: "Malicia",
          url: "https://example.com",
          rest: {
            base: "https://example.com",
            endpoints: [
              {
                label: "x",
                url: "http://169.254.169.254/latest/meta-data/",
                category: "reportes",
                fieldMap: { externalId: "id", titulo: "t" },
              },
            ],
          },
        },
        deps,
      );
      expect(result.status).toBe(400);
    });
  });

  describe("PATCH /sources/{id} (config rest)", () => {
    it("actualiza la rest config y fija connector:'rest'", async () => {
      const put = vi.fn().mockResolvedValue(undefined);
      const deps = makeDeps({
        sourceRepo: {
          list: vi.fn(),
          get: vi.fn().mockResolvedValue(mockSource),
          put,
          delete: vi.fn(),
        },
      });
      const result = await route(
        "PATCH",
        "/sources/src-1",
        { rest: validRest },
        deps,
      );
      expect(result.status).toBe(200);
      expect(put).toHaveBeenCalledWith(
        expect.objectContaining({ connector: "rest", rest: validRest }),
      );
    });
  });

  describe("POST /sources/probe", () => {
    it("devuelve muestra + endpointStats sin guardar", async () => {
      const probeRest = vi.fn().mockResolvedValue({
        items: [
          {
            category: "reportes",
            sourceId: "__probe__",
            externalId: "1",
            titulo: "t",
            texto: "",
            raw: {},
          },
        ],
        endpointStats: [{ label: "reportes", fetched: 1 }],
      });
      const deps = makeDeps({ probeRest });
      const result = await route(
        "POST",
        "/sources/probe",
        { rest: validRest },
        deps,
      );
      expect(result.status).toBe(200);
      expect(probeRest).toHaveBeenCalled();
      expect(result.body).toMatchObject({
        endpointStats: [{ label: "reportes", fetched: 1 }],
        sample: [{ externalId: "1" }],
      });
    });

    it("rechaza rest config inválida con 400", async () => {
      const deps = makeDeps();
      const result = await route(
        "POST",
        "/sources/probe",
        { rest: { base: "no-url", endpoints: [] } },
        deps,
      );
      expect(result.status).toBe(400);
    });
  });

  describe("GET /stats (status enriquecido)", () => {
    it("expone status, lastFetched y endpointStats por fuente", async () => {
      const deps = makeDeps({
        sourceRepo: {
          list: vi.fn().mockResolvedValue([
            {
              ...mockSource,
              status: "ok",
              lastFetched: 42,
              endpointStats: [{ label: "reportes", fetched: 42 }],
            },
          ]),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
        },
      });
      const result = await route("GET", "/stats", null, deps);
      expect(result.status).toBe(200);
      const src = (result.body as { sources: unknown[] }).sources[0];
      expect(src).toMatchObject({
        status: "ok",
        lastFetched: 42,
        endpointStats: [{ label: "reportes", fetched: 42 }],
      });
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unknown path", async () => {
      const deps = makeDeps();
      const result = await route("GET", "/unknown", null, deps);
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ error: "not found" });
    });

    it("returns 404 for wrong method on known path", async () => {
      const deps = makeDeps();
      const result = await route("DELETE", "/config", null, deps);
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ error: "not found" });
    });
  });
});

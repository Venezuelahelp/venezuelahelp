import { describe, it, expect, vi } from "vitest";
import { route, type RouteDeps } from "@/admin-api/router";

const qaEntry = {
  chatId: "7",
  ts: "2026-07-02T00:00:00.000Z",
  pregunta: "¿dónde hay acopios?",
  respuesta: "Hay 3 acopios cerca de Caracas.",
  itemsUsados: ["acopios:a1"],
  tokensIn: 120,
  tokensOut: 80,
  modelo: "nova-lite",
  costoEstimado: 0.0001,
  flagged: false,
};

function makeDeps(over: Partial<RouteDeps> = {}): RouteDeps {
  return {
    qaLogRepo: { listByChat: vi.fn().mockResolvedValue([qaEntry]) },
    ...over,
  } as unknown as RouteDeps;
}

describe("admin-api router — observabilidad", () => {
  describe("GET /qa-logs/{chatId}", () => {
    it("devuelve las interacciones del chat con limit por defecto 50", async () => {
      const deps = makeDeps();
      const res = await route("GET", "/qa-logs/7", null, deps);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([qaEntry]);
      expect(deps.qaLogRepo.listByChat).toHaveBeenCalledWith("7", 50);
    });

    it("respeta ?limit= y lo acota a 200", async () => {
      const deps = makeDeps();
      await route("GET", "/qa-logs/7", null, deps, { limit: "500" });
      expect(deps.qaLogRepo.listByChat).toHaveBeenCalledWith("7", 200);
    });

    it("ignora un limit no numérico (usa el default)", async () => {
      const deps = makeDeps();
      await route("GET", "/qa-logs/7", null, deps, { limit: "abc" });
      expect(deps.qaLogRepo.listByChat).toHaveBeenCalledWith("7", 50);
    });
  });

  describe("GET /stats — snapshotUpdatedAt", () => {
    const statsDeps = (snapshotUpdatedAt?: RouteDeps["snapshotUpdatedAt"]) =>
      makeDeps({
        itemRepo: {
          listByCategory: vi.fn().mockResolvedValue([]),
          countByCategory: vi.fn().mockResolvedValue(0),
        },
        sourceRepo: {
          list: vi.fn().mockResolvedValue([]),
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
        },
        snapshotUpdatedAt,
      } as unknown as Partial<RouteDeps>);

    it("incluye snapshotUpdatedAt cuando el dep lo devuelve", async () => {
      const deps = statsDeps(
        vi.fn().mockResolvedValue("2026-07-02T12:58:00.000Z"),
      );
      const res = await route("GET", "/stats", null, deps);
      expect(res.status).toBe(200);
      expect(
        (res.body as { snapshotUpdatedAt?: string }).snapshotUpdatedAt,
      ).toBe("2026-07-02T12:58:00.000Z");
    });

    it("omite la clave cuando el dep devuelve undefined (HeadObject falló)", async () => {
      const deps = statsDeps(vi.fn().mockResolvedValue(undefined));
      const res = await route("GET", "/stats", null, deps);
      expect(res.status).toBe(200);
      expect("snapshotUpdatedAt" in (res.body as object)).toBe(false);
    });

    it("sigue funcionando sin el dep inyectado (compat)", async () => {
      const deps = statsDeps(undefined);
      const res = await route("GET", "/stats", null, deps);
      expect(res.status).toBe(200);
      expect("snapshotUpdatedAt" in (res.body as object)).toBe(false);
    });
  });

  describe("GET /items/search", () => {
    const found = {
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "e1",
      titulo: "Ana María Pérez",
      texto: "Vista por última vez en Caracas",
    };

    it("busca en el snapshot con q, category y limit (default 50)", async () => {
      const searchSnapshot = vi
        .fn()
        .mockResolvedValue({ items: [found], total: 1 });
      const deps = makeDeps({ searchSnapshot });
      const res = await route("GET", "/items/search", null, deps, {
        q: "ana",
        category: "desaparecidos",
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [found], total: 1 });
      expect(searchSnapshot).toHaveBeenCalledWith({
        q: "ana",
        category: "desaparecidos",
        limit: 50,
      });
    });

    it("acepta limit explícito dentro del rango", async () => {
      const searchSnapshot = vi.fn().mockResolvedValue({ items: [], total: 0 });
      const deps = makeDeps({ searchSnapshot });
      await route("GET", "/items/search", null, deps, { limit: "10" });
      expect(searchSnapshot).toHaveBeenCalledWith({
        q: undefined,
        category: undefined,
        limit: 10,
      });
    });

    it("rechaza una categoría inválida con 400", async () => {
      const searchSnapshot = vi.fn();
      const deps = makeDeps({ searchSnapshot });
      const res = await route("GET", "/items/search", null, deps, {
        category: "inventada",
      });
      expect(res.status).toBe(400);
      expect(searchSnapshot).not.toHaveBeenCalled();
    });

    it("rechaza limit fuera de rango con 400", async () => {
      const deps = makeDeps({ searchSnapshot: vi.fn() });
      const res = await route("GET", "/items/search", null, deps, {
        limit: "9999",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /scrape-runs", () => {
    const run = {
      ts: "2026-07-02T00:28:00.000Z",
      durationMs: 660000,
      sourcesTotal: 11,
      sourcesOk: 10,
      sourcesError: 1,
      created: 12,
      updated: 340,
      unchanged: 45000,
      errors: [{ sourceId: "bad", error: "HTTP 500" }],
    };

    it("lista las últimas corridas (default 10)", async () => {
      const list = vi.fn().mockResolvedValue([run]);
      const deps = makeDeps({ scrapeRunRepo: { list } });
      const res = await route("GET", "/scrape-runs", null, deps);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([run]);
      expect(list).toHaveBeenCalledWith(10);
    });

    it("respeta ?limit= acotado a 50", async () => {
      const list = vi.fn().mockResolvedValue([]);
      const deps = makeDeps({ scrapeRunRepo: { list } });
      await route("GET", "/scrape-runs", null, deps, { limit: "100" });
      expect(list).toHaveBeenCalledWith(50);
    });
  });
});

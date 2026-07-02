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
});

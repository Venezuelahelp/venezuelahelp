import { describe, it, expect, vi } from "vitest";
import { ensureSeedSources } from "@/scraper/seed";
import { SourceRepo } from "@/shared/repos/sourceRepo";

describe("ensureSeedSources", () => {
  it("puts a source that does not exist yet", async () => {
    const repo = new SourceRepo();
    vi.spyOn(repo, "get").mockResolvedValue(null);
    const put = vi.spyOn(repo, "put").mockResolvedValue();
    await ensureSeedSources(repo);
    const ids = put.mock.calls.map((c) => c[0].id).sort();
    expect(ids).toEqual([
      "desaparecidosterremotovenezuela",
      "hospitalesvenezuela",
      "ninosvenezuela",
      "sismovenezuela",
      "terremotovenezuela",
    ]);
  });

  it("siembra desaparecidosterremotovenezuela como blocked y deshabilitada", async () => {
    const repo = new SourceRepo();
    vi.spyOn(repo, "get").mockResolvedValue(null);
    const put = vi.spyOn(repo, "put").mockResolvedValue();
    await ensureSeedSources(repo);
    const blocked = put.mock.calls
      .map((c) => c[0])
      .find((s) => s.id === "desaparecidosterremotovenezuela");
    expect(blocked).toBeDefined();
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.enabled).toBe(false);
  });

  it("seeds ninosvenezuela enabled", async () => {
    const repo = new SourceRepo();
    vi.spyOn(repo, "get").mockResolvedValue(null);
    const put = vi.spyOn(repo, "put").mockResolvedValue();
    await ensureSeedSources(repo);
    const ninos = put.mock.calls
      .map((c) => c[0])
      .find((s) => s.id === "ninosvenezuela");
    expect(ninos?.enabled).toBe(true);
  });

  it("repara la config base de una fuente existente preservando su estado", async () => {
    const repo = new SourceRepo();
    vi.spyOn(repo, "get").mockImplementation(async (id) => {
      if (id === "sismovenezuela") {
        return {
          id: "sismovenezuela",
          nombre: "viejo nombre",
          url: "u",
          connector: "jsonApi",
          enabled: false,
          trustLevel: "official" as const,
          lastRun: "2026-06-01T00:00:00Z",
        };
      }
      return null;
    });
    const put = vi.spyOn(repo, "put").mockResolvedValue();
    await ensureSeedSources(repo);
    // todas las fuentes se escriben (las nuevas se crean, la existente se repara)
    expect(put.mock.calls.map((c) => c[0].id).sort()).toEqual([
      "desaparecidosterremotovenezuela",
      "hospitalesvenezuela",
      "ninosvenezuela",
      "sismovenezuela",
      "terremotovenezuela",
    ]);
    const sismo = put.mock.calls
      .map((c) => c[0])
      .find((s) => s.id === "sismovenezuela");
    // config base reparada (migra a rest)…
    expect(sismo?.connector).toBe("rest");
    expect(sismo?.rest?.endpoints.length).toBeGreaterThan(0);
    expect(sismo?.nombre).toBe("SismoVenezuela");
    // …pero conserva el estado operativo del admin
    expect(sismo?.enabled).toBe(false);
    expect(sismo?.trustLevel).toBe("official");
    expect(sismo?.lastRun).toBe("2026-06-01T00:00:00Z");
  });
});

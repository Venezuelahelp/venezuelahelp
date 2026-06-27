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
      "ninosvenezuela",
      "sismovenezuela",
      "terremotovenezuela",
    ]);
  });

  it("seeds ninosvenezuela disabled (PII de menores: requiere coordinación)", async () => {
    const repo = new SourceRepo();
    vi.spyOn(repo, "get").mockResolvedValue(null);
    const put = vi.spyOn(repo, "put").mockResolvedValue();
    await ensureSeedSources(repo);
    const ninos = put.mock.calls.map((c) => c[0]).find((s) => s.id === "ninosvenezuela");
    expect(ninos?.enabled).toBe(false);
  });

  it("does not overwrite an existing source", async () => {
    const repo = new SourceRepo();
    vi.spyOn(repo, "get").mockImplementation(async (id) => {
      if (id === "sismovenezuela") {
        return {
          id: "sismovenezuela",
          nombre: "x",
          url: "u",
          connector: "jsonApi",
          enabled: false,
        };
      }
      return null;
    });
    const put = vi.spyOn(repo, "put").mockResolvedValue();
    await ensureSeedSources(repo);
    expect(put.mock.calls.map((c) => c[0].id).sort()).toEqual([
      "ninosvenezuela",
      "terremotovenezuela",
    ]);
  });
});

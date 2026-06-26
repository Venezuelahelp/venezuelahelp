import { describe, it, expect } from "vitest";
import { scoreTrust } from "@/enrichment/trust";
import type { StoredItem, EnrichmentConfig } from "@/shared/types";

const CFG: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: ["troll"],
  jaccardThreshold: 0.6,
  geoCellSize: 0.01,
  minTextLen: 10,
};

function item(p: Partial<StoredItem>): StoredItem {
  return {
    category: "reportes",
    sourceId: "s1",
    externalId: "1",
    titulo: "Reporte creíble",
    texto: "Texto suficientemente largo",
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

describe("scoreTrust", () => {
  it("1 fuente y plausible → no_verificado", () => {
    expect(scoreTrust(item({}), 1, undefined, CFG).trust).toBe("no_verificado");
  });
  it("2+ fuentes → corroborado", () => {
    expect(scoreTrust(item({}), 2, undefined, CFG).trust).toBe("corroborado");
  });
  it("fuente oficial → verificado", () => {
    expect(scoreTrust(item({}), 1, { trustLevel: "official" }, CFG).trust).toBe(
      "verificado",
    );
  });
  it("geo fuera de Venezuela → sospechoso con razón", () => {
    const r = scoreTrust(
      item({ ubicacion: { lat: 40, lng: -3 } }),
      3,
      undefined,
      CFG,
    );
    expect(r.trust).toBe("sospechoso");
    expect(r.trustReasons.join(" ")).toMatch(/geocerca|venezuela/i);
  });
  it("texto demasiado corto → sospechoso", () => {
    expect(scoreTrust(item({ texto: "corto" }), 1, undefined, CFG).trust).toBe(
      "sospechoso",
    );
  });
  it("match de blocklist → sospechoso", () => {
    expect(
      scoreTrust(item({ titulo: "esto es troll" }), 1, undefined, CFG).trust,
    ).toBe("sospechoso");
  });
});

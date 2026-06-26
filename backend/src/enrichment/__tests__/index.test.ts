import { describe, it, expect } from "vitest";
import { enrichItems } from "@/enrichment";
import type { StoredItem, EnrichmentConfig } from "@/shared/types";

const CFG: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: [],
  jaccardThreshold: 0.6,
  geoCellSize: 0.01,
  minTextLen: 10,
};

function item(p: Partial<StoredItem>): StoredItem {
  return {
    category: "edificios",
    sourceId: "s1",
    externalId: "1",
    titulo: "Torre",
    texto: "Texto suficientemente largo",
    ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

describe("enrichItems", () => {
  it("marca corroboración y duplicado cuando 2 fuentes coinciden", () => {
    const a = item({
      sourceId: "s1",
      externalId: "1",
      lastSeenAt: "2026-06-25T00:00:00Z",
    });
    const b = item({
      sourceId: "s2",
      externalId: "9",
      lastSeenAt: "2026-06-26T00:00:00Z",
    });
    const out = enrichItems([a, b], CFG);
    expect(out.every((i) => i.sourcesCount === 2)).toBe(true);
    expect(out.every((i) => i.trust === "corroborado")).toBe(true);
    const canon = out.find((i) => i.isCanonical)!;
    const dup = out.find((i) => !i.isCanonical)!;
    expect(canon.externalId).toBe("9"); // más reciente
    expect(dup.dupOf).toBe("s2#9");
    expect(canon.dupOf).toBeUndefined();
  });

  it("ítem único de una fuente → no_verificado y canónico de su cluster", () => {
    const out = enrichItems([item({ sourceId: "s1", externalId: "1" })], CFG);
    expect(out[0].sourcesCount).toBe(1);
    expect(out[0].isCanonical).toBe(true);
    expect(out[0].trust).toBe("no_verificado");
  });

  it("no muta la entrada", () => {
    const a = item({});
    enrichItems([a], CFG);
    expect("trust" in a).toBe(false);
  });
});

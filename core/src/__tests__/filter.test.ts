import { describe, it, expect } from "vitest";
import { filterUsable, haversineKm } from "../index";
import type { PublicItem } from "../index";

const items: PublicItem[] = [
  {
    category: "edificios",
    sourceId: "a",
    externalId: "1",
    titulo: "t",
    texto: "x",
    trust: "corroborado",
    isCanonical: true,
  },
  {
    category: "edificios",
    sourceId: "b",
    externalId: "2",
    titulo: "t",
    texto: "x",
    trust: "corroborado",
    isCanonical: false,
    dupOf: "a#1",
  },
  {
    category: "edificios",
    sourceId: "c",
    externalId: "3",
    titulo: "t",
    texto: "x",
    trust: "sospechoso",
    isCanonical: true,
  },
];

describe("filterUsable", () => {
  it("colapsa duplicados y excluye sospechosos por defecto", () => {
    const out = filterUsable(items);
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("1");
  });
  it("puede incluir duplicados y sospechosos", () => {
    expect(
      filterUsable(items, {
        collapseDuplicates: false,
        includeSuspicious: true,
      }),
    ).toHaveLength(3);
  });
});

describe("haversineKm", () => {
  it("distancia ~0 para el mismo punto", () => {
    expect(
      haversineKm({ lat: 10, lng: -66 }, { lat: 10, lng: -66 }),
    ).toBeCloseTo(0);
  });
});

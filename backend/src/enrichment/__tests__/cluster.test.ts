import { describe, it, expect } from "vitest";
import { normalizeText, jaccard, clusterize } from "@/enrichment/cluster";
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
    titulo: "t",
    texto: "x",
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

describe("normalizeText", () => {
  it("quita tildes y baja a minúsculas", () => {
    expect(normalizeText("José Á. Pérez")).toBe("jose a perez");
  });
});

describe("jaccard", () => {
  it("1 para conjuntos iguales, 0 para disjuntos", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });
});

describe("clusterize", () => {
  it("agrupa edificios con el mismo título en la misma ubicación", () => {
    const a = item({
      sourceId: "s1",
      externalId: "1",
      titulo: "Torre Petunia I y II",
      ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
    });
    const b = item({
      sourceId: "s1",
      externalId: "2",
      titulo: "Torre Petunia I y II",
      ubicacion: { lat: 10.501, lng: -66.901, nombre: "Chacao" },
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(1);
    expect([...clusters.values()][0]).toHaveLength(2);
  });

  it("agrupa desaparecidos por nombre con y sin tilde", () => {
    const a = item({
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "1",
      titulo: "José Pérez",
      ubicacion: undefined,
    });
    const b = item({
      category: "desaparecidos",
      sourceId: "s2",
      externalId: "2",
      titulo: "Jose Perez",
      ubicacion: undefined,
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(1);
  });

  it("funde reportes con textos similares por Jaccard", () => {
    const a = item({
      category: "reportes",
      sourceId: "s1",
      externalId: "1",
      titulo: "RTVC Noticias",
      texto: "Colapso de puente en La Guaira reportado esta tarde",
      ubicacion: undefined,
    });
    const b = item({
      category: "reportes",
      sourceId: "s2",
      externalId: "2",
      titulo: "Otro Medio",
      texto: "Reportan colapso del puente en La Guaira esta tarde",
      ubicacion: undefined,
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(1);
  });

  it("NO agrupa reportes distintos del mismo emisor (título = medio)", () => {
    const a = item({
      category: "reportes",
      sourceId: "s1",
      externalId: "1",
      titulo: "Movimiento Ciudadano",
      texto: "Habilitan refugio temporal en el municipio Baruta",
      ubicacion: undefined,
    });
    const b = item({
      category: "reportes",
      sourceId: "s1",
      externalId: "2",
      titulo: "Movimiento Ciudadano",
      texto: "Suspenden clases en todo el estado Vargas mañana",
      ubicacion: undefined,
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(2);
  });
});

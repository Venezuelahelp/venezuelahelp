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
    titulo: "Torre Petunia",
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

  it("marca el duplicado real de un desaparecido repetido en la misma fuente", () => {
    // Caso observado en producción: la misma persona listada 2 veces por la
    // misma fuente → una ficha canónica y la otra duplicada.
    const a = item({
      category: "desaparecidos",
      sourceId: "vtb",
      externalId: "1",
      titulo: "Luis Bartolomé Hernández Herrera",
      ubicacion: undefined,
      lastSeenAt: "2026-06-25T00:00:00Z",
    });
    const b = item({
      category: "desaparecidos",
      sourceId: "vtb",
      externalId: "2",
      titulo: "Luis Bartolomé Hernández Herrera",
      ubicacion: undefined,
      lastSeenAt: "2026-06-26T00:00:00Z",
    });
    const out = enrichItems([a, b], CFG);
    expect(out.filter((i) => i.isCanonical)).toHaveLength(1);
    const dup = out.find((i) => !i.isCanonical)!;
    expect(dup.dupOf).toBe("vtb#2"); // canónico = el más reciente
    // sourcesCount cuenta fuentes distintas: aquí 1, aunque haya 2 fichas.
    expect(out.every((i) => i.sourcesCount === 1)).toBe(true);
  });

  it("ítem único de una fuente → no_verificado y canónico de su cluster", () => {
    const out = enrichItems([item({ sourceId: "s1", externalId: "1" })], CFG);
    expect(out[0].sourcesCount).toBe(1);
    expect(out[0].isCanonical).toBe(true);
    expect(out[0].trust).toBe("no_verificado");
  });

  it("no agrupa reportes distintos del mismo emisor (título = medio)", () => {
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
    const out = enrichItems([a, b], CFG);
    expect(out.every((i) => i.isCanonical)).toBe(true);
    expect(out.every((i) => i.dupOf === undefined)).toBe(true);
  });

  it("no muta la entrada", () => {
    const a = item({});
    enrichItems([a], CFG);
    expect("trust" in a).toBe(false);
  });
});

describe("enrichItems — statusClass (desaparecidos)", () => {
  it('emite statusClass "buscando" para status de búsqueda (no_encontrado)', () => {
    const out = enrichItems(
      [
        item({
          category: "desaparecidos",
          status: "no_encontrado",
          ubicacion: undefined,
        }),
      ],
      CFG,
    );
    expect(out[0].statusClass).toBe("buscando");
  });

  it('emite statusClass "localizado" para status de hallazgo (encontrado)', () => {
    const out = enrichItems(
      [
        item({
          category: "desaparecidos",
          status: "encontrado",
          ubicacion: undefined,
        }),
      ],
      CFG,
    );
    expect(out[0].statusClass).toBe("localizado");
  });

  it('respeta el default por fuente: venezuela-te-busca sin status → "buscando"', () => {
    const out = enrichItems(
      [
        item({
          category: "desaparecidos",
          sourceId: "venezuela-te-busca",
          status: undefined,
          ubicacion: undefined,
        }),
      ],
      CFG,
    );
    expect(out[0].statusClass).toBe("buscando");
  });

  it('NO emite el campo cuando classifyLocated da "otro" (fallecido)', () => {
    const out = enrichItems(
      [
        item({
          category: "desaparecidos",
          status: "fallecido",
          ubicacion: undefined,
        }),
      ],
      CFG,
    );
    expect("statusClass" in out[0]).toBe(false);
  });

  it("NO emite el campo fuera de desaparecidos aunque el status sea clasificable", () => {
    const out = enrichItems(
      [item({ category: "reportes", status: "encontrado" })],
      CFG,
    );
    expect("statusClass" in out[0]).toBe(false);
  });
});

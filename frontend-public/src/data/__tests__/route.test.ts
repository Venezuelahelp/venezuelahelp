import { describe, it, expect } from "vitest";
import { parseItemRoute, itemHash, findItem } from "../route";
import type { Snapshot } from "@/types";

describe("parseItemRoute", () => {
  it("parsea #/item/<sourceId>/<externalId>", () => {
    expect(parseItemRoute("#/item/usgs/abc123")).toEqual({
      sourceId: "usgs",
      externalId: "abc123",
    });
  });

  it("decodifica componentes URL-encoded (ids compuestos a|b|c)", () => {
    expect(
      parseItemRoute("#/item/pacientesve/maria%7C12345%7Chospital%20vargas"),
    ).toEqual({
      sourceId: "pacientesve",
      externalId: "maria|12345|hospital vargas",
    });
  });

  it("devuelve null para las demás rutas del router", () => {
    for (const h of [
      "",
      "#/",
      "#/fuentes",
      "#/interpretes",
      "#/quienes-somos",
      "#/api",
      "#/api-docs",
      "#/item/soloUnSegmento",
    ]) {
      expect(parseItemRoute(h)).toBeNull();
    }
  });

  it("devuelve null ante un URI malformado en vez de lanzar", () => {
    expect(parseItemRoute("#/item/a/%E0%A4%A")).toBeNull();
  });

  it("itemHash es el inverso de parseItemRoute (roundtrip)", () => {
    const id = { sourceId: "sos/2026", externalId: "a|b/c d" };
    expect(parseItemRoute(itemHash(id))).toEqual(id);
  });
});

describe("findItem", () => {
  const snap: Snapshot = {
    generatedAt: "2026-07-02T00:00:00Z",
    categories: {
      reportes: [],
      desaparecidos: [
        {
          category: "desaparecidos",
          sourceId: "s1",
          externalId: "e1",
          titulo: "Maria Perez",
          texto: "t",
          isCanonical: false, // duplicado: flatten lo colapsa, findItem NO
        },
      ],
      acopios: [],
      edificios: [],
      solicitudes: [],
      hospitales: [],
    },
  };

  it("encuentra el ítem por identidad aunque sea un duplicado no canónico", () => {
    expect(findItem(snap, "s1", "e1")?.titulo).toBe("Maria Perez");
  });

  it("devuelve null si no existe", () => {
    expect(findItem(snap, "s1", "nope")).toBeNull();
    expect(findItem(snap, "otra", "e1")).toBeNull();
  });
});

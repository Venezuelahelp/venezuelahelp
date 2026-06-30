import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../index";

describe("core types", () => {
  it("exporta las 6 categorías en orden", () => {
    expect(CATEGORIES).toEqual([
      "reportes",
      "desaparecidos",
      "acopios",
      "edificios",
      "solicitudes",
      "hospitales",
    ]);
  });
});

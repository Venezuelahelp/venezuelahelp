import { describe, it, expect } from "vitest";
import { inferCategories, CAT_LABEL } from "../index";

describe("inferCategories", () => {
  it("infiere desaparecidos por la señal léxica", () => {
    expect(
      inferCategories("¿hay desaparecidos en Vargas?").has("desaparecidos"),
    ).toBe(true);
  });
  it("infiere solicitudes por 'necesit'", () => {
    expect(inferCategories("necesito agua").has("solicitudes")).toBe(true);
  });
});

describe("CAT_LABEL", () => {
  it("etiqueta legible de desaparecidos", () => {
    expect(CAT_LABEL.desaparecidos).toBe("personas desaparecidas");
  });
});

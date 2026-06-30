import { describe, it, expect } from "vitest";
import { normalize, keywords } from "../index";

describe("normalize", () => {
  it("strips accents and punctuation, lowercases", () => {
    expect(normalize("Médicínas, ¡Agua!")).toBe("medicinas agua");
  });
});

describe("keywords", () => {
  it("filtra stopwords y aplica stemming de plural", () => {
    expect(keywords("¿desaparecidos en La Guaira?")).toContain("desaparecid");
  });
});

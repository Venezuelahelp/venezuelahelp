import { describe, it, expect } from "vitest";
import { buildMatchIndex, locatedNotice } from "@/telegram/locatedNotice";
import type { LocatedMatch } from "@/shared/types";

const match: LocatedMatch = {
  nombre: "Juan Perez Lopez",
  signal: "nombre-fuerte",
  locatedSourcesCount: 1,
  missing: { sourceId: "A", texto: "buscado" },
  located: {
    sourceId: "B",
    texto: "encontrado en refugio",
    sourceUrl: "https://x/y",
    sources: ["B"],
  },
};

describe("locatedNotice", () => {
  it("devuelve aviso para un nombre con match (orden de tokens distinto)", () => {
    const idx = buildMatchIndex([match]);
    const txt = locatedNotice("Lopez Juan Perez", idx);
    expect(txt).toContain("reportada como");
    expect(txt).toContain("no confirmada");
  });
  it("añade 'Corroborado por N fuentes' solo si locatedSourcesCount ≥ 2", () => {
    const idx1 = buildMatchIndex([match]);
    expect(locatedNotice("Juan Perez Lopez", idx1)).not.toContain(
      "Corroborado",
    );

    const idx2 = buildMatchIndex([{ ...match, locatedSourcesCount: 3 }]);
    expect(locatedNotice("Juan Perez Lopez", idx2)).toContain(
      "Corroborado por 3 fuentes",
    );
  });
  it("devuelve null si no hay match", () => {
    const idx = buildMatchIndex([match]);
    expect(locatedNotice("Maria Rodriguez", idx)).toBeNull();
  });
});

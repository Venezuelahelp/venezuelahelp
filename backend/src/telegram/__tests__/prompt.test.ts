import { describe, it, expect } from "vitest";
import { buildUserText } from "@/telegram/prompt";
import type { PublicItem } from "@/telegram/types";

const items: PublicItem[] = [
  {
    category: "acopios",
    sourceId: "sismovenezuela",
    externalId: "1",
    titulo: "Centro Chacao",
    texto: "Agua y comida",
    ubicacion: { lat: 10, lng: -66, nombre: "Chacao" },
  },
];

describe("buildUserText", () => {
  it("includes the question, the context items and the source", () => {
    const t = buildUserText("dónde hay agua", items);
    expect(t).toContain("dónde hay agua");
    expect(t).toContain("Centro Chacao");
    expect(t).toContain("sismovenezuela");
    expect(t.toLowerCase()).toContain("no tengo ese dato");
  });

  it("handles empty context", () => {
    const t = buildUserText("hola", []);
    expect(t).toContain("hola");
    expect(t.toLowerCase()).toContain("no tengo ese dato");
  });
});

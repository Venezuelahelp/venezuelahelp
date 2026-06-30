import { describe, it, expect } from "vitest";
import { scoreFields } from "../index";
import type { PublicItem } from "../index";

const it1: PublicItem = {
  category: "acopios",
  sourceId: "s",
  externalId: "1",
  titulo: "Acopio Petare",
  texto: "agua",
};

describe("scoreFields", () => {
  it("pondera título por encima de texto", () => {
    expect(scoreFields(it1, ["petare"])).toBeGreaterThan(
      scoreFields(it1, ["agua"]),
    );
  });
});

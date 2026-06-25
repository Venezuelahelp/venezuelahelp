import { describe, it, expect } from "vitest";
import { itemKey, contentHash } from "@/shared/keys";
import type { NormalizedItem } from "@/shared/types";

const base: NormalizedItem = {
  category: "reportes",
  sourceId: "sismo",
  externalId: "42",
  titulo: "Edificio colapsado",
  texto: "Calle 5",
  raw: { a: 1 },
};

describe("itemKey", () => {
  it("builds stable PK/SK from category and ids", () => {
    expect(itemKey("reportes", "sismo", "42")).toEqual({
      PK: "CAT#reportes",
      SK: "sismo#42",
    });
  });
});

describe("contentHash", () => {
  it("is stable for same meaningful content", () => {
    expect(contentHash(base)).toBe(contentHash({ ...base, raw: { b: 2 } }));
  });

  it("changes when meaningful content changes", () => {
    expect(contentHash(base)).not.toBe(
      contentHash({ ...base, texto: "Calle 6" }),
    );
  });
});

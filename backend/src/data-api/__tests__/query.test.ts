import { describe, it, expect } from "vitest";
import { queryItems } from "@/data-api/query";
import type { DataSnapshot } from "@/data-api/snapshot";
import type { PublicItem } from "@/telegram/types";

function item(p: Partial<PublicItem> & { externalId: string }): PublicItem {
  return {
    category: "desaparecidos",
    sourceId: "s1",
    titulo: "",
    texto: "",
    ...p,
  };
}

const snap: DataSnapshot = {
  generatedAt: "2026-06-29T00:00:00.000Z",
  categories: {
    desaparecidos: [
      item({ externalId: "1", titulo: "Robeth Enrique", texto: "Caracas" }),
      item({ externalId: "2", titulo: "Maria Perez", texto: "Valencia" }),
      item({
        externalId: "3",
        titulo: "Jose en Chacao",
        ubicacion: { lat: 10.5, lng: -66.85 },
      }),
    ],
    reportes: [
      item({ externalId: "4", category: "reportes", titulo: "Derrumbe" }),
    ],
  },
};

describe("queryItems", () => {
  it("filters by category", () => {
    const r = queryItems(snap, { category: "reportes" });
    expect(r.items.map((i) => i.externalId)).toEqual(["4"]);
  });

  it("returns items across all categories when no category given", () => {
    const r = queryItems(snap, {});
    expect(r.total).toBe(4);
  });

  it("filters by keyword over titulo/texto (accent-insensitive)", () => {
    const r = queryItems(snap, { q: "robeth" });
    expect(r.items.map((i) => i.externalId)).toEqual(["1"]);
  });

  it("requires all keywords to match (AND)", () => {
    const r = queryItems(snap, { q: "maria valencia" });
    expect(r.items.map((i) => i.externalId)).toEqual(["2"]);
  });

  it("filters by proximity (near + radiusKm)", () => {
    const r = queryItems(snap, {
      near: { lat: 10.5, lng: -66.85 },
      radiusKm: 5,
    });
    expect(r.items.map((i) => i.externalId)).toEqual(["3"]);
  });

  it("paginates with limit and an opaque cursor", () => {
    const page1 = queryItems(snap, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = queryItems(snap, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeUndefined();
    // No overlap between pages.
    const ids = new Set([
      ...page1.items.map((i) => i.externalId),
      ...page2.items.map((i) => i.externalId),
    ]);
    expect(ids.size).toBe(4);
  });

  it("caps limit at the maximum", () => {
    const r = queryItems(snap, { limit: 99999 });
    expect(r.items.length).toBeLessThanOrEqual(200);
  });
});

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

  it("retorna ítems con cualquier keyword coincidente", () => {
    // "maria" hits externalId "2" (desaparecidos); "derrumbe" hits externalId "4" (reportes)
    // OR semantics: both items are returned even though neither has BOTH keywords
    const r = queryItems(snap, { q: "maria derrumbe" });
    const ids = r.items.map((i) => i.externalId);
    expect(ids).toContain("2");
    expect(ids).toContain("4");
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

const snapAcopios: DataSnapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      {
        category: "acopios",
        sourceId: "s",
        externalId: "1",
        titulo: "Acopio Petare",
        texto: "agua",
      },
      {
        category: "acopios",
        sourceId: "s",
        externalId: "2",
        titulo: "Centro Chacao",
        texto: "comida",
      },
    ],
  },
};

// Fixture con DOS ítems que AMBOS coinciden con "petare" pero en campos distintos.
// El viejo código substring-AND los devolvería en orden de inserción (item "1" primero).
// El nuevo ranking devuelve item "2" primero porque titulo tiene mayor peso que texto.
const snapRanking: DataSnapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      // "petare" solo en texto → score bajo
      {
        category: "acopios",
        sourceId: "s",
        externalId: "1",
        titulo: "Centro Norte",
        texto: "acopio en petare zona apoyo",
      },
      // "petare" en titulo → score alto (titulo weight > texto)
      {
        category: "acopios",
        sourceId: "s",
        externalId: "2",
        titulo: "Acopio Petare",
        texto: "agua",
      },
    ],
  },
};

describe("queryItems (core)", () => {
  it("rankea titulo > texto (relevancia, no substring-AND)", () => {
    const r = queryItems(snapRanking, { q: "petare" });
    expect(r.items[0].externalId).toBe("2"); // titulo match ranks higher
    expect(r.items).toHaveLength(2); // OR semantics: both items match
  });
  it("pagina con cursor", () => {
    const r = queryItems(snapAcopios, { limit: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(2);
    expect(r.nextCursor).toBeDefined();
  });
});

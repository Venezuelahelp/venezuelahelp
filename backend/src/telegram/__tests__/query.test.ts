import { describe, it, expect } from "vitest";
import { listItems, formatList, countItems } from "@/telegram/query";
import type { PublicItem, Snapshot } from "@/telegram/types";

function d(id: string, nombre: string, zona?: string): PublicItem {
  return {
    category: "desaparecidos",
    sourceId: "s",
    externalId: id,
    titulo: nombre,
    texto: "",
    ubicacion: zona ? { lat: 0, lng: 0, nombre: zona } : undefined,
  } as PublicItem;
}

const snap = {
  generatedAt: "t",
  categories: {
    desaparecidos: [
      d("1", "Ana", "La Guaira"),
      d("2", "Beto", "Caracas"),
      { ...d("3", "Dup"), isCanonical: false } as PublicItem,
      { ...d("4", "Sospechoso"), trust: "sospechoso" } as PublicItem,
      d("5", "Carla", "La Guaira"),
    ],
    acopios: [],
    reportes: [],
  },
} as unknown as Snapshot;

describe("listItems", () => {
  it("excluye sospechosos y duplicados (no canónicos)", () => {
    const { total, page } = listItems(snap, { category: "desaparecidos" });
    expect(total).toBe(3); // Ana, Beto, Carla (Dup y Sospechoso fuera)
    expect(page.map((i) => i.titulo)).toEqual(["Ana", "Beto", "Carla"]);
  });

  it("filtra por zona", () => {
    const { total, page } = listItems(snap, {
      category: "desaparecidos",
      zona: "La Guaira",
    });
    expect(total).toBe(2);
    expect(page.map((i) => i.titulo)).toEqual(["Ana", "Carla"]);
  });

  it("respeta el límite", () => {
    const { page } = listItems(snap, { category: "desaparecidos", limite: 1 });
    expect(page).toHaveLength(1);
  });
});

describe("formatList", () => {
  it("muestra total real y numera", () => {
    const { total, page } = listItems(snap, { category: "desaparecidos", limite: 2 });
    const txt = formatList("desaparecidos", total, page);
    expect(txt).toContain("📋");
    expect(txt).toContain("mostrando 2 de 3");
    expect(txt).toContain("1. Ana");
    expect(txt).toContain("La Guaira");
  });
});

describe("countItems", () => {
  it("cuenta una categoría agregando fuentes (excluye sospechosos)", () => {
    const txt = countItems(snap, { category: "desaparecidos" });
    expect(txt).toContain("3");
    expect(txt).toContain("personas desaparecidas");
  });

  it("cuenta por zona", () => {
    const txt = countItems(snap, { category: "desaparecidos", zona: "La Guaira" });
    expect(txt).toContain("2");
    expect(txt).toContain("La Guaira");
  });
});

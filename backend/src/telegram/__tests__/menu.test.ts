// backend/src/telegram/__tests__/menu.test.ts
import { describe, it, expect } from "vitest";
import {
  categoryScreen,
  homeScreen,
  locationPrompt,
  navScreen,
  selectItems,
  LOCATION_ACTIONS,
} from "@/telegram/menu";
import type { PublicItem, Snapshot } from "@/telegram/types";

function item(p: Partial<PublicItem>): PublicItem {
  return {
    category: "acopios",
    sourceId: "s",
    externalId: Math.random().toString(36).slice(2),
    titulo: "x",
    texto: "y",
    ...p,
  };
}

const snap: Snapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      item({ titulo: "Albergue Central", texto: "camas disponibles" }),
      item({
        titulo: "Punto de agua potable",
        texto: "reparten agua y comida",
      }),
      item({ titulo: "Recolecta de ropa", texto: "donaciones de insumos" }),
    ],
    solicitudes: [
      item({ category: "solicitudes", titulo: "Hospital pide voluntarios" }),
    ],
  },
};

describe("homeScreen", () => {
  it("ofrece insumos, voluntariado y NECESITO AYUDA", () => {
    const flat = (homeScreen().replyMarkup as any).inline_keyboard.flat();
    const datas = flat.map((b: any) => b.callback_data);
    expect(datas).toEqual(
      expect.arrayContaining(["insumos", "voluntariado", "ayuda"]),
    );
  });
});

describe("navScreen", () => {
  it("'animales' devuelve mensaje de próximamente", () => {
    const r = navScreen("animales")!;
    expect(r.text.toLowerCase()).toContain("próximamente");
  });
  it("'ayuda' ofrece los 4 sub-botones", () => {
    const flat = (
      navScreen("ayuda")!.replyMarkup as any
    ).inline_keyboard.flat();
    const datas = flat.map((b: any) => b.callback_data);
    expect(datas).toEqual(
      expect.arrayContaining([
        "emergencias",
        "refugios",
        "viveres",
        "animales",
      ]),
    );
  });
  it("devuelve null para acciones de categoría", () => {
    expect(navScreen("refugios")).toBeNull();
  });
});

describe("selectItems (sub-filtro de acopios)", () => {
  it("refugios captura albergue y NO el resto", () => {
    const titulos = selectItems("refugios", snap).map((i) => i.titulo);
    expect(titulos).toContain("Albergue Central");
    expect(titulos).not.toContain("Recolecta de ropa");
  });
  it("viveres captura agua/comida", () => {
    const titulos = selectItems("viveres", snap).map((i) => i.titulo);
    expect(titulos).toContain("Punto de agua potable");
  });
  it("insumos excluye albergues", () => {
    const titulos = selectItems("insumos", snap).map((i) => i.titulo);
    expect(titulos).toContain("Recolecta de ropa");
    expect(titulos).not.toContain("Albergue Central");
  });
  it("voluntariado lee de solicitudes", () => {
    const titulos = selectItems("voluntariado", snap).map((i) => i.titulo);
    expect(titulos).toContain("Hospital pide voluntarios");
  });
});

describe("categoryScreen", () => {
  it("muestra mensaje vacío cuando no hay ítems", () => {
    const empty: Snapshot = { generatedAt: "t", categories: {} };
    const r = categoryScreen("refugios", empty);
    expect(r.text.toLowerCase()).toContain("no hay registros");
  });
  it("incluye un botón Volver", () => {
    const flat = (
      categoryScreen("refugios", snap).replyMarkup as any
    ).inline_keyboard.flat();
    expect(flat.some((b: any) => b.text.includes("Volver"))).toBe(true);
  });
});

describe("locationPrompt / LOCATION_ACTIONS", () => {
  it("las acciones de categoría requieren ubicación", () => {
    expect([...LOCATION_ACTIONS].sort()).toEqual([
      "insumos",
      "refugios",
      "viveres",
      "voluntariado",
    ]);
  });
  it("ofrece teclado con request_location y opción de saltar", () => {
    const mk = locationPrompt("refugios").replyMarkup as any;
    const flat = mk.keyboard.flat();
    expect(flat.some((b: any) => b.request_location === true)).toBe(true);
    expect(flat.some((b: any) => b.text === "Ver sin ubicación")).toBe(true);
  });
});

describe("categoryScreen — paginación «Ver más»", () => {
  const bigSnap: Snapshot = {
    generatedAt: "t",
    categories: {
      solicitudes: Array.from({ length: 20 }, (_, i) =>
        item({
          category: "solicitudes",
          externalId: String(i),
          titulo: `Solicitud ${i + 1}`,
        }),
      ),
    },
  };

  it("con más de 8 ítems añade «Ver más» con el offset siguiente (≤64 bytes)", () => {
    const r = categoryScreen("voluntariado", bigSnap);
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    const more = flat.find((b: any) => b.text.includes("Ver más"));
    expect(more).toBeTruthy();
    expect(more.callback_data).toBe("more:voluntariado:8");
    expect(more.callback_data.length).toBeLessThanOrEqual(64);
  });

  it("offset=8 pinta la 2ª página con numeración continua", () => {
    const r = categoryScreen("voluntariado", bigSnap, undefined, 8);
    expect(r.text).toContain("9. Solicitud 9");
    expect(r.text).not.toContain("1. Solicitud 1\n");
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    const more = flat.find((b: any) => b.text.includes("Ver más"));
    expect(more.callback_data).toBe("more:voluntariado:16");
  });

  it("en la última página no ofrece «Ver más» pero sí Volver", () => {
    const r = categoryScreen("voluntariado", bigSnap, undefined, 16);
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    expect(flat.some((b: any) => b.text.includes("Ver más"))).toBe(false);
    expect(flat.some((b: any) => b.text.includes("Volver"))).toBe(true);
  });

  it("offset más allá del final muestra el vacío sin lanzar", () => {
    const r = categoryScreen("voluntariado", bigSnap, undefined, 999);
    expect(r.text.toLowerCase()).toContain("no hay registros");
  });

  it("con 8 o menos ítems NO muestra «Ver más» (regresión)", () => {
    const r = categoryScreen("voluntariado", snap); // 1 solicitud en el fixture
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    expect(flat.some((b: any) => b.text.includes("Ver más"))).toBe(false);
  });
});

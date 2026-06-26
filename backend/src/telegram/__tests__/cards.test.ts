import { describe, it, expect } from "vitest";
import { mapsUrl, renderList } from "@/telegram/cards";
import type { PublicItem } from "@/telegram/types";

const conGeo: PublicItem = {
  category: "acopios",
  sourceId: "s",
  externalId: "1",
  titulo: "Albergue San Manuel",
  texto: "Aceptan mascotas. Traer identificación.",
  ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
  trust: "verificado",
};
const sinGeo: PublicItem = {
  category: "acopios",
  sourceId: "s",
  externalId: "2",
  titulo: "Punto sin ubicación",
  texto: "Sin coordenadas",
  trust: "no_verificado",
};

describe("mapsUrl", () => {
  it("construye URL de Google Maps con lat,lng", () => {
    expect(mapsUrl({ lat: 10.5, lng: -66.9 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=10.5,-66.9",
    );
  });
});

describe("renderList", () => {
  it("añade botón 'Cómo llegar' solo para ítems con ubicación", () => {
    const { buttons } = renderList([conGeo, sinGeo]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0][0].url).toContain("query=10.5,-66.9");
  });

  it("muestra insignia de trust y nombre de ubicación", () => {
    const { text } = renderList([conGeo]);
    expect(text).toContain("Albergue San Manuel");
    expect(text).toContain("✅");
    expect(text).toContain("Chacao");
  });

  it("muestra distancia aproximada cuando hay ubicación del usuario", () => {
    const { text } = renderList([conGeo], { lat: 10.5, lng: -66.9 });
    expect(text).toMatch(/km/);
  });
});

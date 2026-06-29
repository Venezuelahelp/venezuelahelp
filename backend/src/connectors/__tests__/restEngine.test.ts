import { describe, it, expect, vi } from "vitest";
import {
  getPath,
  fillTemplate,
  mapRow,
  runRestSource,
} from "@/connectors/restEngine";
import type { RestEndpoint, RestConfig } from "@/connectors/restConfig";

describe("getPath", () => {
  it("resuelve dot-paths anidados e índices", () => {
    expect(getPath({ a: { b: [{ c: 1 }] } }, "a.b.0.c")).toBe(1);
  });
  it("devuelve undefined si falta", () => {
    expect(getPath({ a: {} }, "a.b.c")).toBeUndefined();
  });
  it("path vacío devuelve el objeto entero", () => {
    const o = [1, 2];
    expect(getPath(o, "")).toBe(o);
  });
});

describe("fillTemplate", () => {
  it("sustituye {campo}", () => {
    expect(fillTemplate("/r/{id}", { id: 42 })).toBe("/r/42");
  });
  it("campo ausente → cadena vacía", () => {
    expect(fillTemplate("/r/{id}", {})).toBe("/r/");
  });
});

const arrEp: RestEndpoint = {
  label: "r",
  url: "https://s.com/api/r",
  category: "reportes",
  shape: "array",
  fieldMap: {
    externalId: "id",
    titulo: "place",
    texto: ["a", "b"],
    lat: "lat",
    lng: "lng",
    imageUrl: "img",
    sourceUrl: "src",
  },
};

describe("mapRow", () => {
  it("mapea una fila array (texto unido, imagen relativa→absoluta, sourceUrl)", () => {
    const item = mapRow(
      {
        id: 1,
        place: "Catia",
        a: "x",
        b: "y",
        lat: 10,
        lng: -66,
        img: "/p.jpg",
        src: "https://t/1",
      },
      arrEp,
      "https://s.com",
    );
    expect(item).toMatchObject({
      category: "reportes",
      externalId: "1",
      titulo: "Catia",
      texto: "x · y",
      sourceUrl: "https://t/1",
      imageUrl: "https://s.com/p.jpg",
    });
    expect(item!.ubicacion).toEqual({ lat: 10, lng: -66, nombre: "Catia" });
  });

  it("usa sourceUrlTemplate cuando no hay campo sourceUrl", () => {
    const ep: RestEndpoint = {
      ...arrEp,
      fieldMap: {
        externalId: "id",
        titulo: "place",
        sourceUrlTemplate: "https://s.com/r/{id}",
      },
    };
    const item = mapRow({ id: 7, place: "x" }, ep, "https://s.com");
    expect(item!.sourceUrl).toBe("https://s.com/r/7");
  });

  it("geojson: properties + coordinates [lng,lat]", () => {
    const ep: RestEndpoint = {
      label: "e",
      url: "u",
      category: "edificios",
      shape: "geojson",
      fieldMap: { externalId: "id", titulo: "place" },
    };
    const item = mapRow(
      {
        properties: { id: "9", place: "Torre" },
        geometry: { coordinates: [-66.9, 10.5] },
      },
      ep,
      "https://s.com",
    );
    expect(item!.externalId).toBe("9");
    expect(item!.ubicacion).toEqual({ lat: 10.5, lng: -66.9, nombre: "Torre" });
  });

  it("descarta fila sin externalId (null)", () => {
    expect(mapRow({ place: "x" }, arrEp, "https://s.com")).toBeNull();
  });

  it("titulo vacío → fallback", () => {
    const item = mapRow({ id: 2 }, arrEp, "https://s.com");
    expect(item!.titulo).toBe("(sin título)");
  });

  it("titulo como cadena de fallback usa el primer path no vacío", () => {
    const ep: RestEndpoint = {
      ...arrEp,
      fieldMap: { externalId: "id", titulo: ["location_name", "author"] },
    };
    expect(
      mapRow({ id: 1, location_name: "", author: "Ana" }, ep, "https://s.com")!
        .titulo,
    ).toBe("Ana");
    expect(
      mapRow(
        { id: 2, location_name: "Catia", author: "Ana" },
        ep,
        "https://s.com",
      )!.titulo,
    ).toBe("Catia");
    expect(mapRow({ id: 3 }, ep, "https://s.com")!.titulo).toBe("(sin título)");
  });
});

describe("runRestSource", () => {
  const cfg: RestConfig = {
    base: "https://s.com",
    endpoints: [
      {
        label: "reportes",
        url: "https://s.com/api/r",
        category: "reportes",
        fieldMap: { externalId: "id", titulo: "t" },
      },
      {
        label: "acopios",
        url: "https://s.com/api/a",
        category: "acopios",
        itemsPath: "data",
        fieldMap: { externalId: "id", titulo: "t" },
      },
    ],
  };

  it("concatena ítems con sourceId fijado y stats por endpoint", async () => {
    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith("/api/r")) return [{ id: "1", t: "uno" }] as unknown;
      return { data: [{ id: "2", t: "dos" }] } as unknown;
    });
    const { items, endpointStats } = await runRestSource("src1", cfg, {
      fetchJson: fetchJson as never,
    });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.sourceId === "src1")).toBe(true);
    expect(endpointStats).toEqual([
      { label: "reportes", fetched: 1 },
      { label: "acopios", fetched: 1 },
    ]);
  });

  it("un endpoint roto no tumba los demás (registra error)", async () => {
    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith("/api/r")) throw new Error("boom");
      return { data: [{ id: "2", t: "dos" }] } as unknown;
    });
    const { items, endpointStats } = await runRestSource("src1", cfg, {
      fetchJson: fetchJson as never,
    });
    expect(items).toHaveLength(1);
    expect(endpointStats[0]).toEqual({
      label: "reportes",
      fetched: 0,
      error: "boom",
    });
    expect(endpointStats[1]).toEqual({ label: "acopios", fetched: 1 });
  });

  it("respuesta no-array → fetched 0 + error (¿HTML/SPA?)", async () => {
    const fetchJson = vi.fn(async () => "<!DOCTYPE html>" as unknown);
    const oneEp: RestConfig = {
      base: "https://s.com",
      endpoints: [cfg.endpoints[0]],
    };
    const { items, endpointStats } = await runRestSource("src1", oneEp, {
      fetchJson: fetchJson as never,
    });
    expect(items).toHaveLength(0);
    expect(endpointStats[0].fetched).toBe(0);
    expect(endpointStats[0].error).toMatch(/array/i);
  });
});

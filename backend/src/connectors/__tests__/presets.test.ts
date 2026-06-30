import { describe, it, expect } from "vitest";
import { PRESETS } from "@/connectors/presets";
import { runRestSource } from "@/connectors/restEngine";

describe("presets rest", () => {
  it("usgs (geojson): mapea code→externalId, title→titulo, coords→ubicacion", async () => {
    const feature = {
      type: "Feature",
      properties: {
        code: "6000t7zp",
        title: "M 7.5 - 28 km SE of Yumare, Venezuela",
        place: "28 km SE of Yumare, Venezuela",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zp",
      },
      geometry: { coordinates: [-68.4716, 10.4351, 10] },
    };
    const { items } = await runRestSource("usgs", PRESETS.usgs, {
      fetchJson: (async () => ({ features: [feature] })) as never,
    });
    expect(items[0]).toMatchObject({
      category: "reportes",
      externalId: "6000t7zp",
      titulo: "M 7.5 - 28 km SE of Yumare, Venezuela",
      sourceUrl: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zp",
    });
    expect(items[0].ubicacion).toEqual({
      lat: 10.4351,
      lng: -68.4716,
      nombre: "M 7.5 - 28 km SE of Yumare, Venezuela",
    });
  });

  it("red-esperanza desaparecidos: nombre→titulo, foto_url→imageUrl, lat/lng", async () => {
    const row = {
      id: "b6a262c7",
      nombre: "Saymar Reina",
      ultima_ubicacion: "Catia la mar",
      fecha_desaparicion: "2026-06-24",
      contacto_familiar: "Vanessa, 0424",
      lat: 10.59,
      lng: -67.01,
      foto_url: "https://cdn-imagenes.theempire.tech/images/x.jpg",
      estado: "no_encontrado",
    };
    const { items } = await runRestSource(
      "red-esperanza",
      { base: "https://x", endpoints: [PRESETS["red-esperanza"].endpoints[0]] },
      { fetchJson: (async () => [row]) as never },
    );
    expect(items[0]).toMatchObject({
      category: "desaparecidos",
      externalId: "b6a262c7",
      titulo: "Saymar Reina",
      imageUrl: "https://cdn-imagenes.theempire.tech/images/x.jpg",
      status: "no_encontrado",
    });
    expect(items[0].ubicacion).toEqual({
      lat: 10.59,
      lng: -67.01,
      nombre: "Saymar Reina",
    });
  });

  it("pacientesve (Google Sheet): filas-array, id compuesto, salta encabezado", async () => {
    const values = [
      ["Nombre", "Cédula", "Edad", "Hospital", "Estado", "Condición"],
      ["Aaron Villastro", "—", "8", "H. Pérez Carreño", "Caracas", "Ingresado"],
    ];
    const { items } = await runRestSource("pacientesve", PRESETS.pacientesve, {
      fetchJson: (async () => ({ values })) as never,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: "desaparecidos",
      externalId: "Aaron Villastro|—|H. Pérez Carreño",
      titulo: "Aaron Villastro",
      status: "Ingresado",
    });
  });

  it("sos-en-venezuela: reports→desaparecidos con status", async () => {
    const reports = [
      {
        id: 1782,
        name: "Wilmari Abello",
        lastSeen: "Hospital X",
        status: "deceased",
        notes: "C.I. 18",
      },
    ];
    const { items } = await runRestSource(
      "sos-en-venezuela",
      {
        base: "https://x",
        endpoints: [PRESETS["sos-en-venezuela"].endpoints[0]],
      },
      { fetchJson: (async () => ({ reports })) as never },
    );
    expect(items[0]).toMatchObject({
      category: "desaparecidos",
      externalId: "1782",
      titulo: "Wilmari Abello",
      status: "deceased",
    });
  });

  it("venezuela-reporta personas: nombre→titulo, ficha_url→sourceUrl, foto_url→imageUrl", async () => {
    const persona = {
      id: "c4788175",
      status: "buscando",
      nombre: "Yonathan Jimenez",
      edad: 38,
      ciudad: "Caraballeda",
      zona: "La Guaira",
      ultima_vez: "Edf. Coral Park",
      descripcion: "Alto, flaco",
      foto_url:
        "https://wlvcfbuxkdrxhxqlwwmo.supabase.co/storage/v1/object/public/fotos/x.jpg",
      ficha_url: "https://venezuelareporta.org/reporte/c4788175",
    };
    const { items } = await runRestSource(
      "venezuela-te-busca",
      {
        base: "https://venezuelareporta.org",
        endpoints: [PRESETS["venezuela-te-busca"].endpoints[0]],
      },
      { fetchJson: (async () => ({ ok: true, personas: [persona] })) as never },
    );
    expect(items[0]).toMatchObject({
      category: "desaparecidos",
      externalId: "c4788175",
      titulo: "Yonathan Jimenez",
      imageUrl:
        "https://wlvcfbuxkdrxhxqlwwmo.supabase.co/storage/v1/object/public/fotos/x.jpg",
      sourceUrl: "https://venezuelareporta.org/reporte/c4788175",
      status: "buscando",
    });
  });

  it("venezuela-reporta sitios: nombre→titulo, lat/lng→ubicacion (acopios)", async () => {
    const sitio = {
      id: "53f412fb",
      tipo: "acopio",
      nombre: "Acopio- Lumière",
      lat: 8.574,
      lng: -71.174,
      estado_operativo: "abierto",
      nota: null,
    };
    const { items } = await runRestSource(
      "venezuela-te-busca",
      {
        base: "https://venezuelareporta.org",
        endpoints: [PRESETS["venezuela-te-busca"].endpoints[1]],
      },
      { fetchJson: (async () => ({ ok: true, sitios: [sitio] })) as never },
    );
    expect(items[0]).toMatchObject({
      category: "acopios",
      externalId: "53f412fb",
      titulo: "Acopio- Lumière",
      status: "abierto",
    });
    expect(items[0].ubicacion).toEqual({
      lat: 8.574,
      lng: -71.174,
      nombre: "Acopio- Lumière",
    });
  });
});

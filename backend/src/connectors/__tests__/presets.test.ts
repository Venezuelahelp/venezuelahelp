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

  it("ayuda-en-camino needs→solicitudes: nombreArticulo→titulo, urgencia→status, org en texto, sin coords", async () => {
    const need = {
      id: 2581,
      orgId: 541,
      nombreArticulo: "COMIDAS: ALMUERZOS Y CENAS",
      categoria: "comida_preparada",
      descripcion: null,
      cantidadNecesaria: 150,
      cantidadComprometida: 50,
      cantidadCumplida: 43,
      urgencia: "critica",
      status: "parcial",
      notaInterna: null,
      createdAt: "2026-07-05T15:59:01.581Z",
      updatedAt: "2026-07-07T14:29:34.526Z",
      commitmentCount: 2,
      organizacion: {
        id: 541,
        nombre: "EDIFICIO PUERTAS DEL MAR",
        tipo: "lugar_afectado",
        estado: "La Guaira",
        ciudad: "TANAGUARENAS",
        direccion: "Tanaguarenas",
        contactoNombre: "ANDRÉS MENDOZA",
        contactoTelefono: "04243496964",
        contactoEmail: "aandresmendoza.s@gmail.com",
        verificada: true,
        createdAt: "2026-07-05T15:52:56.992Z",
      },
    };
    const { items } = await runRestSource(
      "ayuda-en-camino",
      {
        base: "https://ayudaencamino.com",
        endpoints: [PRESETS["ayuda-en-camino"].endpoints[0]],
      },
      { fetchJson: (async () => [need]) as never },
    );
    expect(items[0]).toMatchObject({
      category: "solicitudes",
      externalId: "2581",
      titulo: "COMIDAS: ALMUERZOS Y CENAS",
      status: "critica",
    });
    // Sin lat/lng → geo() no crea objeto ubicacion (no aparece en el mapa).
    expect(items[0].ubicacion).toBeUndefined();
    // La localización (estado/ciudad) y la organización viajan en el texto.
    expect(items[0].texto).toContain("EDIFICIO PUERTAS DEL MAR");
    expect(items[0].texto).toContain("La Guaira");
    expect(items[0].texto).toContain("TANAGUARENAS");
    // Sin permalink por ítem → sin sourceUrl (cae a la home de la fuente).
    expect(items[0].sourceUrl).toBeUndefined();
    // PRIVACIDAD: emisor lugar_afectado (vivienda particular) → el teléfono NO
    // va en el texto; el resto (nombre/estado/ciudad) se mantiene.
    expect(items[0].texto).not.toContain("04243496964");
  });

  it("ayuda-en-camino needs de un centro institucional (refugio) SÍ publica el teléfono", async () => {
    const need = {
      id: 2806,
      orgId: 510,
      nombreArticulo: "Ceftazimida avibactam I.V",
      categoria: "insumos_medicos",
      descripcion: "En ampollas ",
      urgencia: "critica",
      status: "activa",
      organizacion: {
        id: 510,
        nombre: "Centro de acopio Vista el lago",
        tipo: "refugio",
        estado: "Miranda",
        ciudad: "Caracas",
        direccion: "La california, calle campo rico, residencia vista el lago.",
        contactoNombre: "Luis Galíndez",
        contactoTelefono: "+584124859873",
        contactoEmail: "odluisgalindez13@gmail.com",
        verificada: true,
      },
    };
    const { items } = await runRestSource(
      "ayuda-en-camino",
      {
        base: "https://ayudaencamino.com",
        endpoints: [PRESETS["ayuda-en-camino"].endpoints[0]],
      },
      { fetchJson: (async () => [need]) as never },
    );
    // Emisor institucional → el contacto es útil y se mantiene.
    expect(items[0].texto).toContain("+584124859873");
    expect(items[0].texto).toContain("Centro de acopio Vista el lago");
  });

  it("ayuda-en-camino organizations→acopios: nombre→titulo, tipo→status, contacto/ubicacion en texto", async () => {
    const org = {
      id: 416,
      nombre: "Edificio La Estrella, Macuto ",
      tipo: "lugar_afectado",
      estado: "La Guaira",
      ciudad: "La Guaira ",
      direccion: "Av. Alamo, Macuto, Edificio La Estrella",
      contactoNombre: "Ivannia",
      contactoTelefono: "0412-4028250",
      horario: "URGENTE",
      verificada: true,
      createdAt: "2026-07-01T21:36:08.786Z",
      mergedIntoOrgId: null,
      additionalContacts: [],
    };
    const { items } = await runRestSource(
      "ayuda-en-camino",
      {
        base: "https://ayudaencamino.com",
        endpoints: [PRESETS["ayuda-en-camino"].endpoints[1]],
      },
      { fetchJson: (async () => [org]) as never },
    );
    expect(items[0]).toMatchObject({
      category: "acopios",
      externalId: "416",
      titulo: "Edificio La Estrella, Macuto",
      status: "lugar_afectado",
    });
    // Sin lat/lng → sin objeto ubicacion (la localización va en el texto).
    expect(items[0].ubicacion).toBeUndefined();
    expect(items[0].texto).toContain("Av. Alamo, Macuto, Edificio La Estrella");
    expect(items[0].texto).toContain("Ivannia");
    expect(items[0].sourceUrl).toBeUndefined();
    // PRIVACIDAD: org lugar_afectado (vivienda particular) → sin teléfono.
    expect(items[0].texto).not.toContain("0412-4028250");
  });

  it("ayuda-en-camino org de un centro institucional (cocina) SÍ publica el teléfono", async () => {
    const org = {
      id: 392,
      nombre: "Centro de comidas El Marqués",
      tipo: "cocina",
      estado: "Distrito Capital",
      ciudad: "Caracas",
      direccion: "Calle Terepaima",
      contactoNombre: "Helen",
      contactoTelefono: "04221471086",
      horario: "Lunes a Domingo de 9 - 6 pm",
      verificada: true,
      mergedIntoOrgId: null,
      additionalContacts: [],
    };
    const { items } = await runRestSource(
      "ayuda-en-camino",
      {
        base: "https://ayudaencamino.com",
        endpoints: [PRESETS["ayuda-en-camino"].endpoints[1]],
      },
      { fetchJson: (async () => [org]) as never },
    );
    // Centro institucional → el contacto es útil y se mantiene.
    expect(items[0].texto).toContain("04221471086");
    expect(items[0].texto).toContain("Calle Terepaima");
  });

  it("ayuda-en-camino: el x-site-key viaja en endpoint.headers", () => {
    for (const ep of PRESETS["ayuda-en-camino"].endpoints) {
      expect(ep.headers?.["x-site-key"]).toBe(
        "5699fbbdf439677b8825e84d826742eb82211d5c3f4491a7",
      );
    }
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

import type { RestConfig } from "@/connectors/restConfig";

// Presets declarativos de fuentes que encajan en el motor `rest` (mapeo
// campo-a-campo). Las fuentes con lógica irregular (categoría-por-tipo en un
// mismo endpoint, o composición de texto etiquetada) se mantienen como
// conectores bespoke por ahora (terremotovenezuela, ninosvenezuela,
// hospitalesvenezuela).

const SISMO_BASE = "https://www.sismovenezuela.com";

// sismovenezuela: cada categoría es un endpoint con mapeo directo. Todas las
// categorías traen un permalink al origen (source_url / properties.source) que
// ahora capturamos (antes solo reportes).
export const sismovenezuela: RestConfig = {
  base: SISMO_BASE,
  endpoints: [
    {
      label: "reportes",
      url: `${SISMO_BASE}/api/reports/feed?limit=200`,
      category: "reportes",
      shape: "array",
      fieldMap: {
        externalId: "id",
        // location_name suele venir; si no, el autor; si tampoco, "Reporte"
        // (paridad con el bespoke original `location_name || author || "Reporte"`).
        titulo: ["location_name", "author"],
        tituloDefault: "Reporte",
        texto: ["text_content"],
        lat: "lat",
        lng: "lng",
        status: "damage_level",
        imageUrl: "media_urls.0",
        sourceUrl: "source_url",
      },
    },
    {
      label: "acopios",
      url: `${SISMO_BASE}/api/relief-centers`,
      category: "acopios",
      shape: "array",
      fieldMap: {
        externalId: "id",
        titulo: "name",
        texto: ["address", "state", "accepted_items"],
        lat: "lat",
        lng: "lng",
        sourceUrl: "source_url",
      },
    },
    {
      label: "edificios",
      url: `${SISMO_BASE}/api/building-damage`,
      category: "edificios",
      itemsPath: "features",
      shape: "geojson",
      fieldMap: {
        externalId: "id",
        titulo: "place",
        texto: ["damage_type", "needs"],
        status: "affected",
        imageUrl: "photo_url",
        sourceUrl: "source",
      },
    },
    {
      label: "solicitudes",
      url: `${SISMO_BASE}/api/needs`,
      category: "solicitudes",
      itemsPath: "data",
      shape: "array",
      fieldMap: {
        externalId: "id",
        titulo: "title",
        texto: ["description", "items_needed"],
        lat: "lat",
        lng: "lng",
        status: "priority",
        sourceUrl: "source_url",
      },
    },
  ],
};

// usgs: API GeoJSON oficial de sismos, acotada al bounding box de Venezuela.
// shape geojson → properties es la fila y geometry.coordinates [lng,lat] dan
// lat/lng automáticamente. starttime fijo (el motor no soporta fechas dinámicas).
export const usgs: RestConfig = {
  base: "https://earthquake.usgs.gov",
  endpoints: [
    {
      label: "sismos",
      url: "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2026-06-01&minlatitude=0.5&maxlatitude=13&minlongitude=-74&maxlongitude=-59&minmagnitude=2.5&orderby=time&limit=200",
      category: "reportes",
      itemsPath: "features",
      shape: "geojson",
      fieldMap: {
        externalId: "code",
        titulo: "title",
        texto: ["place"],
        sourceUrl: "url",
      },
    },
  ],
};

// vzlayuda: Supabase, vista pública `avisos_publicos`. Dos tipos → dos
// categorías. Sin geo/imagen/permalink. ~399 ítems (cabe en una página).
const VZLAYUDA_SB = "https://crjzkbjwvolprjqlltxe.supabase.co";
const VZLAYUDA_KEY = "sb_publishable_mI-_toSXtu1vx78fpj5rjQ_cL0F9aOb";
const vzlayudaHeaders = {
  apikey: VZLAYUDA_KEY,
  authorization: `Bearer ${VZLAYUDA_KEY}`,
};
export const vzlayuda: RestConfig = {
  base: VZLAYUDA_SB,
  endpoints: [
    {
      label: "necesidades",
      url: `${VZLAYUDA_SB}/rest/v1/avisos_publicos?select=*&tipo=eq.necesidad&order=creado_en.desc`,
      category: "solicitudes",
      shape: "array",
      headers: vzlayudaHeaders,
      fieldMap: {
        externalId: "id",
        titulo: ["titulo", "subcategoria"],
        texto: ["descripcion", "subcategoria", "zona", "ciudad", "estado"],
        status: "subcategoria",
      },
    },
    {
      label: "ofertas",
      url: `${VZLAYUDA_SB}/rest/v1/avisos_publicos?select=*&tipo=eq.oferta&order=creado_en.desc`,
      category: "acopios",
      shape: "array",
      headers: vzlayudaHeaders,
      fieldMap: {
        externalId: "id",
        titulo: ["titulo", "subcategoria"],
        texto: [
          "descripcion",
          "subcategoria",
          "zona",
          "ciudad",
          "estado",
          "nombre_negocio",
        ],
      },
    },
  ],
};

// sos-en-venezuela: API Express same-origin. reports = personas; data trae
// locations (centros) y chat (mensajes). coords es [lat,lng].
const SOS_BASE = "https://sosenvenezuela.com/sos";
export const sosenvenezuela: RestConfig = {
  base: SOS_BASE,
  endpoints: [
    {
      label: "reportes-personas",
      url: `${SOS_BASE}/api/reports`,
      category: "desaparecidos",
      itemsPath: "reports",
      shape: "array",
      fieldMap: {
        externalId: "id",
        titulo: ["name"],
        texto: ["lastSeen", "notes"],
        status: "status",
      },
    },
    {
      label: "centros",
      url: `${SOS_BASE}/api/data`,
      category: "hospitales",
      itemsPath: "locations",
      shape: "array",
      fieldMap: {
        externalId: "id",
        titulo: ["name"],
        texto: ["locationName", "type", "status"],
        lat: "coords.0",
        lng: "coords.1",
        status: "status",
      },
    },
    {
      label: "muro",
      url: `${SOS_BASE}/api/data`,
      category: "solicitudes",
      itemsPath: "chat",
      shape: "array",
      fieldMap: {
        externalId: "id",
        titulo: ["sender"],
        texto: ["text"],
      },
    },
  ],
};

// localiza-pacientes: Next.js, /api/hospitals devuelve el array de hospitales.
// Los pacientes solo salen por búsqueda capada (no enumerable) → no se ingieren.
export const localizapacientes: RestConfig = {
  base: "https://localizapacientes.com",
  endpoints: [
    {
      label: "hospitales",
      url: "https://localizapacientes.com/api/hospitals",
      category: "hospitales",
      shape: "array",
      fieldMap: {
        externalId: "id",
        titulo: ["nombre"],
        texto: ["ciudad", "estado", "estadoReporte"],
        status: "estadoReporte",
      },
    },
  ],
};

// red-esperanza: Supabase. `desaparecidos` es un espejo público (sin reCAPTCHA)
// de la fuente theempire (32k+ registros) → se pagina. Más acopios y necesidades.
const RDE_SB = "https://hqoirxajavaaasvdfjoy.supabase.co";
const RDE_KEY = "sb_publishable_4qdzpICdtyX6N_XqiVmuYw_Jv_zYvOq";
const rdeHeaders = { apikey: RDE_KEY, authorization: `Bearer ${RDE_KEY}` };
export const redesperanza: RestConfig = {
  base: RDE_SB,
  endpoints: [
    {
      label: "desaparecidos",
      url: `${RDE_SB}/rest/v1/desaparecidos?select=*&order=creado_en.desc`,
      category: "desaparecidos",
      shape: "array",
      headers: rdeHeaders,
      paginate: { pageSize: 1000, maxItems: 40000 },
      fieldMap: {
        externalId: "id",
        titulo: ["nombre"],
        texto: ["ultima_ubicacion", "fecha_desaparicion", "contacto_familiar"],
        lat: "lat",
        lng: "lng",
        imageUrl: "foto_url",
        status: "estado",
      },
    },
    {
      label: "acopios",
      url: `${RDE_SB}/rest/v1/centros_acopio?select=*`,
      category: "acopios",
      shape: "array",
      headers: rdeHeaders,
      paginate: { pageSize: 1000, maxItems: 5000 },
      fieldMap: {
        externalId: "id",
        titulo: ["nombre"],
        texto: ["descripcion", "direccion", "ciudad", "pais"],
        lat: "lat",
        lng: "lng",
        sourceUrl: "red_social",
      },
    },
    {
      label: "necesidades",
      url: `${RDE_SB}/rest/v1/necesidades?select=*`,
      category: "solicitudes",
      shape: "array",
      headers: rdeHeaders,
      paginate: { pageSize: 1000, maxItems: 5000 },
      fieldMap: {
        externalId: "id",
        titulo: ["tipo"],
        texto: ["descripcion", "zona", "urgencia"],
        lat: "lat",
        lng: "lng",
        status: "urgencia",
      },
    },
  ],
};

// pacientesve: Google Sheet pública vía Sheets API. Filas-array (índices como
// paths), sin id estable (id compuesto nombre|cédula|hospital), encabezado en la
// fila 0 (skipRows), y la key restringe por Referer.
// Columnas: 0 Nombre 1 Cédula 2 Edad 3 Hospital 4 Estado 5 Condición 6 Notas …
export const pacientesve: RestConfig = {
  base: "https://pacientesve.com",
  endpoints: [
    {
      label: "pacientes",
      url: "https://sheets.googleapis.com/v4/spreadsheets/1CSrJaBeCSo_l_0eoXI7SocThHKlRDztRMJaic1Ts0Ww/values/lista?key=AIzaSyDiAYBYfu33VPJavslmVByDFt5p0xV6U-I",
      category: "desaparecidos",
      itemsPath: "values",
      shape: "array",
      skipRows: 1,
      headers: {
        Referer: "https://pacientesve.com/",
        Origin: "https://pacientesve.com",
      },
      fieldMap: {
        externalId: "0",
        externalIdFrom: ["0", "1", "3"],
        titulo: ["0"],
        texto: ["3", "5", "4", "6"],
        status: "5",
      },
    },
  ],
};

export const PRESETS: Record<string, RestConfig> = {
  sismovenezuela,
  usgs,
  vzlayuda,
  "sos-en-venezuela": sosenvenezuela,
  "localiza-pacientes": localizapacientes,
  "red-esperanza": redesperanza,
  pacientesve,
};

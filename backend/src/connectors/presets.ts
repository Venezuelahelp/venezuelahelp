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
        titulo: "location_name",
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

export const PRESETS: Record<string, RestConfig> = {
  sismovenezuela,
};

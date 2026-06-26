// Metadata de fuentes para mostrar un nombre legible y enlazar al sitio
// original. El snapshot solo trae `sourceId` (sin URL por ítem: las fuentes no
// exponen permalinks), así que enlazamos al SITIO de la fuente, no al post.
//
// Solo se enlazan fuentes con URL conocida y verificada (desde los conectores
// del backend). Para `sourceId` desconocidos mostramos un nombre derivado SIN
// link, para no redirigir a un destino inventado.

interface SourceMeta {
  nombre: string;
  url?: string;
}

export const SOURCE_META: Record<string, SourceMeta> = {
  sismovenezuela: {
    nombre: "SismoVenezuela",
    url: "https://www.sismovenezuela.com",
  },
  terremotovenezuela: {
    nombre: "Terremoto Venezuela",
    url: "https://terremotovenezuela.app",
  },
  usgs: {
    nombre: "USGS",
    url: "https://earthquake.usgs.gov",
  },
  // URL no verificada → se muestra el nombre sin enlace.
  "venezuela-te-busca": { nombre: "Venezuela Te Busca" },
  "wiki-terremoto": { nombre: "Wikipedia" },
};

export function resolveSource(sourceId: string): SourceMeta {
  // Fuente conocida → nombre (+ url si verificada). Desconocida → id tal cual,
  // sin enlace (faithful, no inventa destino).
  return SOURCE_META[sourceId] ?? { nombre: sourceId };
}

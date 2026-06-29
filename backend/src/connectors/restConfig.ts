import type { Category } from "@/shared/types";

// Mapeo declarativo de campos de una fila JSON de la fuente a un NormalizedItem.
// Los valores son dot-paths (`"a.b.0.c"`) salvo `texto` (lista de dot-paths que
// se unen con " · ") y `sourceUrlTemplate` (plantilla "{campo}").
export interface FieldMap {
  externalId: string;
  // Identidad compuesta: si está, el externalId se forma uniendo estos dot-paths
  // (no vacíos) con "|". Para fuentes sin id estable (p.ej. una Google Sheet:
  // nombre+cédula+hospital). Tiene precedencia sobre `externalId`.
  externalIdFrom?: string[];
  // dot-path al título, o una cadena de fallback (se usa el primero no vacío;
  // p.ej. ["location_name","author"]).
  titulo: string | string[];
  // Literal usado cuando todos los paths de `titulo` quedan vacíos (p.ej.
  // "Reporte"). Si no se define → "(sin título)".
  tituloDefault?: string;
  texto?: string[];
  lat?: string;
  lng?: string;
  imageUrl?: string;
  sourceUrl?: string;
  // Si la API no trae un permalink, se construye con esta plantilla, p.ej.
  // "https://sitio/r/{id}". Se prefiere `sourceUrl` cuando ambos existen.
  sourceUrlTemplate?: string;
  status?: string;
}

export interface RestEndpoint {
  label: string;
  url: string;
  category: Category;
  // dot-path al array de filas dentro de la respuesta. "" / undefined = la raíz
  // ya es un array.
  itemsPath?: string;
  // "geojson" = {features:[{properties,geometry.coordinates:[lng,lat]}]}.
  shape?: "array" | "geojson";
  fieldMap: FieldMap;
  // Cabeceras extra (p.ej. apikey/authorization de Supabase, Referer).
  headers?: Record<string, string>;
  // Filas iniciales a descartar tras extraer el array (p.ej. la fila de
  // encabezados de una Google Sheet).
  skipRows?: number;
  // Paginación: si está, se pagina con `&limit=<pageSize>&offset=<n>` (PostgREST
  // /Supabase) hasta agotar o alcanzar `maxItems`. Sin esto, un solo fetch.
  paginate?: { pageSize: number; maxItems?: number };
}

export interface RestConfig {
  // Origen para resolver imageUrl/sourceUrl relativas a absolutas.
  base: string;
  endpoints: RestEndpoint[];
}

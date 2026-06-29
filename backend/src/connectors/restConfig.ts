import type { Category } from "@/shared/types";

// Mapeo declarativo de campos de una fila JSON de la fuente a un NormalizedItem.
// Los valores son dot-paths (`"a.b.0.c"`) salvo `texto` (lista de dot-paths que
// se unen con " · ") y `sourceUrlTemplate` (plantilla "{campo}").
export interface FieldMap {
  externalId: string;
  titulo: string;
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
  // Cabeceras extra (p.ej. apikey/authorization de Supabase).
  headers?: Record<string, string>;
}

export interface RestConfig {
  // Origen para resolver imageUrl/sourceUrl relativas a absolutas.
  base: string;
  endpoints: RestEndpoint[];
}

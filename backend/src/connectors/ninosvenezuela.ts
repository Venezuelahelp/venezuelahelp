import { fetchJson } from "@/connectors/http";
import { imageUrl, truncate, type SourceConnector } from "@/connectors/types";
import { logger } from "@/shared/logger";
import type { Category, NormalizedItem } from "@/shared/types";

const ID = "ninosvenezuela";
const BASE = "https://ninosvenezuela.org";

// El sitio es una SPA cuyo backend es Supabase (PostgREST). La lectura de la
// tabla `ninos` es anónima (la anon/publishable key va embebida en el cliente
// web y es pública por diseño; solo da acceso de LECTURA según las RLS de la
// fuente). El Turnstile del sitio solo protege el alta, no la lectura.
const SUPABASE_URL = "https://hzyjnuksgbdnvtejidlr.supabase.co";
const ANON_KEY = "sb_publishable_k-S69KCq0yGhBnRqMxiAcA_yP62UH9c";

// Campos del NIÑO que se exponen para reunificación: incluye foto y cédula del
// menor (decisión del operador). Se siguen EXCLUYENDO los datos de quien
// registra (`quien_registra`, `cedula_registra`, `telefono_registra`), los
// teléfonos de contacto y las notas médicas — esos son de la persona que
// reporta, no del niño, y ni siquiera entran al `raw`.
const COLUMNS = [
  "id",
  "nombre",
  "apellido",
  "cedula",
  "edad",
  "sexo",
  "condicion",
  "estado_familiar",
  "senas_particulares",
  "refugio",
  "estado_vzla",
  "municipio",
  "foto_url",
  "created_at",
].join(",");

interface NinoRow {
  id: string;
  nombre?: string | null;
  apellido?: string | null;
  cedula?: string | null;
  edad?: string | null;
  sexo?: string | null;
  condicion?: string | null;
  estado_familiar?: string | null;
  senas_particulares?: string | null;
  refugio?: string | null;
  estado_vzla?: string | null;
  municipio?: string | null;
  foto_url?: string | null;
}

function join(parts: Array<string | null | undefined>, sep: string): string {
  return parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(sep);
}

export const ninosvenezuela: SourceConnector = {
  id: ID,
  async fetchItems(): Promise<NormalizedItem[]> {
    const url =
      `${SUPABASE_URL}/rest/v1/ninos` +
      `?select=${encodeURIComponent(COLUMNS)}&order=created_at.desc`;
    let rows: NinoRow[];
    try {
      rows = await fetchJson<NinoRow[]>(url, 15000, {
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
      });
    } catch (err) {
      logger.warn("ninosvenezuela fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    return (rows ?? []).map((r) => {
      const nombre = join([r.nombre, r.apellido], " ");
      const lugar = join([r.refugio, r.municipio, r.estado_vzla], ", ");
      const texto = join(
        [
          r.cedula ? `C.I. ${r.cedula}` : "",
          r.edad ? `${r.edad} años` : "",
          r.sexo,
          r.estado_familiar,
          r.condicion ? `Condición: ${r.condicion}` : "",
          r.senas_particulares,
          lugar ? `Visto en: ${lugar}` : "",
        ],
        " · ",
      );
      return {
        category: "desaparecidos" as Category,
        sourceId: ID,
        externalId: String(r.id),
        titulo: truncate(nombre || "Niño sin identificar", 120),
        texto: truncate(texto),
        // La tabla no trae lat/lng (solo refugio/municipio/estado como texto):
        // estos ítems salen en la lista, no en el mapa.
        ubicacion: undefined,
        status: r.estado_familiar ?? undefined,
        imageUrl: imageUrl(BASE, r.foto_url),
        raw: r,
      };
    });
  },
};

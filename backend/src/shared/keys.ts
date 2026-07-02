import { createHash } from "node:crypto";
import type { Category, NormalizedItem } from "@/shared/types";

export const CONFIG_KEY = { PK: "CONFIG", SK: "GLOBAL" } as const;

// Fuentes: PARTICIÓN COMPARTIDA (PK fija) para listarlas con Query barato — NO
// Scan. PK="SOURCE", SK=<id>. Antes era PK="SOURCE#<id>", SK="META" (una
// partición por fuente), lo que obligaba a `list()` a hacer un Scan de toda la
// tabla (~55k ítems CAT#) → ThrottlingException/500 en el admin al cargar varios
// list() en paralelo. Mismo patrón que APIREQ/APIKEY.
export const SOURCE_PK = "SOURCE";

export function QA_PK(chatId: string) {
  return `QA#${chatId}`;
}

export function RATE_PK(chatId: string) {
  return `RATE#${chatId}`;
}

// Analítica de visitantes y usuarios de Telegram.
export function VISIT_PK(date: string) {
  return `VISIT#${date}`;
}
export const VSTAT_PK = "VSTAT";
export const TGUSER_PK = "TGUSER";

// Programa de API para terceros: solicitudes de acceso y API keys emitidas.
// Viven en una PARTICIÓN COMPARTIDA (PK fija) para listarlas con Query barato —
// NO Scan. La tabla tiene ~55k ítems `CAT#`; un Scan completo por cada list()
// saturaba la capacidad de lectura (ThrottlingException 500 en el admin).
// - Solicitud: PK="APIREQ", SK=<id>
// - API key:   PK="APIKEY", SK=<sha256(rawKey)>  (authorizer hace GetItem por
//   SK=hash; el valor en claro NUNCA se persiste)
export const APIREQ_PK = "APIREQ";
export const APIKEY_PK = "APIKEY";

// Historial de corridas del scraper: PARTICIÓN COMPARTIDA (PK fija) para
// listar con Query barato — NO Scan. PK="SCRAPERUN", SK=<ts ISO del inicio>.
export const SCRAPERUN_PK = "SCRAPERUN";

export function itemKey(
  category: Category,
  sourceId: string,
  externalId: string,
) {
  return { PK: `CAT#${category}`, SK: `${sourceId}#${externalId}` };
}

export function contentHash(item: NormalizedItem): string {
  const meaningful = {
    titulo: item.titulo,
    texto: item.texto,
    ubicacion: item.ubicacion ?? null,
    status: item.status ?? null,
  };
  return createHash("sha256").update(JSON.stringify(meaningful)).digest("hex");
}

import { createHash } from "node:crypto";
import type { Category, NormalizedItem } from "@/shared/types";

export const CONFIG_KEY = { PK: "CONFIG", SK: "GLOBAL" } as const;

export function SOURCE_PK(id: string) {
  return `SOURCE#${id}`;
}

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
// SKs distintos de "META" para NO contaminar el scan de SourceRepo (SK="META").
export function APIREQ_PK(id: string) {
  return `APIREQ#${id}`;
}
export const APIREQ_SK = "REQ";
// La clave se identifica por el hash de su valor en claro (lookup O(1) en el
// authorizer); el valor en claro NUNCA se persiste.
export function APIKEY_PK(hash: string) {
  return `APIKEY#${hash}`;
}
export const APIKEY_SK = "KEY";

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

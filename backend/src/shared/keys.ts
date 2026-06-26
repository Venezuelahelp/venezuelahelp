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

import { createHash } from "node:crypto";
import type { Category, NormalizedItem } from "@/shared/types";

export const CONFIG_KEY = { PK: "CONFIG", SK: "GLOBAL" } as const;

export function SOURCE_PK(id: string) {
  return `SOURCE#${id}`;
}

export function QA_PK(chatId: string) {
  return `QA#${chatId}`;
}

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

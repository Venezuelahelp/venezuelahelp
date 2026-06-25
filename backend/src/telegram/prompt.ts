import type { PublicItem } from "@/telegram/types";

export function buildContext(items: PublicItem[]): string {
  if (items.length === 0) return "(sin información relevante en los datos)";
  return items
    .map((it, i) => {
      const loc = it.ubicacion?.nombre
        ? ` | Ubicación: ${it.ubicacion.nombre}`
        : "";
      const st = it.status ? ` | Estado: ${it.status}` : "";
      return `${i + 1}. [${it.category}] ${it.titulo} — ${it.texto}${loc}${st} | Fuente: ${it.sourceId}`;
    })
    .join("\n");
}

export function buildUserText(question: string, items: PublicItem[]): string {
  return [
    "Información disponible sobre el terremoto de Venezuela:",
    buildContext(items),
    "",
    `Pregunta: ${question}`,
    "",
    'Responde en español, breve y claro, usando SOLO la información de arriba y citando la fuente. Si la información no permite responder, di exactamente "No tengo ese dato".',
  ].join("\n");
}

import { createHash } from "node:crypto";
import { z } from "zod";
import { geo, truncate } from "@/connectors/types";
import { logger } from "@/shared/logger";
import type { NormalizedItem, Source } from "@/shared/types";

const MAX_CHARS = 12000;
const MAX_ITEMS = 50;
const STALE_MS = 6 * 60 * 60 * 1000;

export function htmlToText(html: string, maxChars = MAX_CHARS): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > maxChars ? t.slice(0, maxChars) : t;
}

const aiItem = z.object({
  category: z.enum([
    "reportes",
    "desaparecidos",
    "acopios",
    "edificios",
    "solicitudes",
  ]),
  titulo: z.string().min(1),
  texto: z.string().optional().default(""),
  ubicacion: z
    .object({
      nombre: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
});

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

interface BedrockDep {
  askBedrock: (
    modelId: string,
    system: string,
    user: string,
  ) => Promise<{ text: string }>;
}

export async function extractItems(
  text: string,
  hint: string | undefined,
  modelId: string,
  sourceId: string,
  deps: BedrockDep,
): Promise<NormalizedItem[]> {
  const system =
    "Eres un extractor de información sobre el terremoto de Venezuela. Devuelves SOLO un array JSON válido, sin texto adicional.";
  const user = [
    "Del siguiente contenido, extrae los ítems relevantes al terremoto como un array JSON.",
    'Cada ítem: {"category": una de [reportes, desaparecidos, acopios, edificios, solicitudes], "titulo": string, "texto": string, "ubicacion"?: {"nombre"?: string, "lat"?: number, "lng"?: number}}.',
    hint ? `Enfócate en: ${hint}.` : "",
    "Si no hay nada relevante, devuelve [].",
    "",
    "CONTENIDO:",
    text,
  ].join("\n");

  const { text: out } = await deps.askBedrock(modelId, system, user);
  const start = out.indexOf("[");
  const end = out.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(out.slice(start, end + 1));
  } catch {
    logger.warn("aiConnector: JSON inválido de Bedrock", { sourceId });
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const items: NormalizedItem[] = [];
  let dropped = 0;
  for (const candidate of raw.slice(0, MAX_ITEMS)) {
    const parsed = aiItem.safeParse(candidate);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const it = parsed.data;
    items.push({
      category: it.category,
      sourceId,
      externalId: sha256(`${it.category}|${it.titulo}|${it.texto}`),
      titulo: truncate(it.titulo, 120),
      texto: truncate(
        [it.texto, it.ubicacion?.nombre].filter(Boolean).join(" · "),
      ),
      ubicacion: geo(
        it.ubicacion?.lat,
        it.ubicacion?.lng,
        it.ubicacion?.nombre,
      ),
      raw: it,
    });
  }
  if (dropped)
    logger.warn("aiConnector: ítems descartados por validación", {
      sourceId,
      dropped,
    });
  return items;
}

export async function runAiSource(
  source: Source,
  now: string,
  modelId: string,
  deps: BedrockDep & { fetchText: (url: string) => Promise<string> },
): Promise<{
  items: NormalizedItem[];
  nextHash: string;
  nextExtractAt?: string;
  skipped: boolean;
}> {
  const html = await deps.fetchText(source.url);
  const text = htmlToText(html);
  const hash = sha256(text);
  const lastMs = source.lastExtractAt ? Date.parse(source.lastExtractAt) : 0;
  const fresh = Date.parse(now) - lastMs < STALE_MS;
  if (hash === source.lastContentHash && fresh) {
    return { items: [], nextHash: hash, skipped: true };
  }
  const items = await extractItems(
    text,
    source.extractHint,
    modelId,
    source.id,
    deps,
  );
  return { items, nextHash: hash, nextExtractAt: now, skipped: false };
}

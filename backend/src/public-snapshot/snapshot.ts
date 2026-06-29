import { gzipSync } from "node:zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ItemRepo } from "@/shared/repos/itemRepo";
import { ConfigRepo } from "@/shared/repos/configRepo";
import { SourceRepo } from "@/shared/repos/sourceRepo";
import { enrichItems, type EnrichedItem } from "@/enrichment";
import { CATEGORIES, type Category } from "@/shared/types";

const s3 = new S3Client({});
const KEY = "snapshot.json";

type PublicItem = Omit<EnrichedItem, "raw">;

function toPublic({ raw, ...rest }: EnrichedItem): PublicItem {
  return rest;
}

// El enlace "ver fuente" pertenece a la fuente, no al ítem: cada `sourceId`
// tiene exactamente una URL. Exponemos un mapa por fuente (en vez de repetir la
// URL en cada ítem) para que el frontend resuelva `sources[item.sourceId]` sin
// inflar el snapshot.
type PublicSource = { nombre: string; url: string };

interface Deps {
  itemRepo: Pick<ItemRepo, "listByCategory">;
  configRepo: Pick<ConfigRepo, "get">;
  sourceRepo: Pick<SourceRepo, "list" | "listEnabled">;
  s3: Pick<S3Client, "send">;
}

export async function buildSnapshot(
  now: string,
  deps?: Partial<Deps>,
): Promise<{ key: string; count: number }> {
  const itemRepo = (deps?.itemRepo as Deps["itemRepo"]) ?? new ItemRepo();
  const configRepo =
    (deps?.configRepo as Deps["configRepo"]) ?? new ConfigRepo();
  const sourceRepo =
    (deps?.sourceRepo as Deps["sourceRepo"]) ?? new SourceRepo();
  const client = (deps?.s3 as Deps["s3"]) ?? s3;

  const cfg = await configRepo.get();
  // Mapa sourceId → { trustLevel } para el enriquecimiento (fuentes habilitadas).
  const sourceTrust = new Map(
    (await sourceRepo.listEnabled()).map((s) => [
      s.id,
      { trustLevel: s.trustLevel },
    ]),
  );

  const categories: Record<Category, PublicItem[]> = {} as Record<
    Category,
    PublicItem[]
  >;
  let count = 0;
  for (const cat of CATEGORIES) {
    const items = await itemRepo.listByCategory(cat);
    const enriched = enrichItems(items, cfg.enrichment, sourceTrust);
    categories[cat] = enriched.map(toPublic);
    count += enriched.length;
  }

  // Mapa de fuentes (nombre + url) para que el frontend enlace cada ítem a su
  // fuente original vía `sources[item.sourceId]` y para listar las fuentes en
  // el Hero/Footer públicos. Solo fuentes habilitadas: al deshabilitar una en
  // el admin desaparece del público, y los sourceIds huérfanos (sin SOURCE#)
  // no aparecen como fuentes.
  const sources: Record<string, PublicSource> = {};
  for (const s of await sourceRepo.listEnabled()) {
    sources[s.id] = { nombre: s.nombre, url: s.url };
  }

  // gzip al escribir: el snapshot crece con todas las fuentes (decenas de MB) y
  // CloudFront NO auto-comprime objetos >10MB → sin esto el público descargaría
  // el JSON entero sin comprimir. Con `Content-Encoding: gzip`, el navegador lo
  // descomprime de forma transparente y el bot lo gunzipea al leer.
  const json = JSON.stringify({ generatedAt: now, categories, sources });
  const body = gzipSync(json);
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.SNAPSHOT_BUCKET,
      Key: KEY,
      Body: body,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      CacheControl: "public, max-age=300",
    }),
  );
  return { key: KEY, count };
}

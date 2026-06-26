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

interface Deps {
  itemRepo: Pick<ItemRepo, "listByCategory">;
  configRepo: Pick<ConfigRepo, "get">;
  sourceRepo: Pick<SourceRepo, "listEnabled">;
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
  const sources = new Map(
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
    const enriched = enrichItems(items, cfg.enrichment, sources);
    categories[cat] = enriched.map(toPublic);
    count += enriched.length;
  }

  const body = JSON.stringify({ generatedAt: now, categories });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.SNAPSHOT_BUCKET,
      Key: KEY,
      Body: body,
      ContentType: "application/json",
      CacheControl: "public, max-age=300",
    }),
  );
  return { key: KEY, count };
}

import { SourceRepo } from "@/shared/repos/sourceRepo";
import { ItemRepo } from "@/shared/repos/itemRepo";
import { getConnector as defaultGetConnector } from "@/connectors/registry";
import { ensureSeedSources } from "@/scraper/seed";
import { runAiSource as defaultRunAiSource } from "@/connectors/aiConnector";
import { safeFetchText } from "@/connectors/ssrf";
import { ConfigRepo } from "@/shared/repos/configRepo";
import { askBedrock as defaultAskBedrock } from "@/telegram/bedrock";
import type { Source } from "@/shared/types";

export interface SourceResult {
  sourceId: string;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  error?: string;
}

interface Deps {
  sourceRepo: Pick<SourceRepo, "listEnabled" | "put">;
  itemRepo: Pick<ItemRepo, "upsert">;
  seed: (repo: SourceRepo) => Promise<void>;
  getConnector: typeof defaultGetConnector;
  configRepo: Pick<ConfigRepo, "get">;
  runAiSource: typeof defaultRunAiSource;
  fetchText: (url: string) => Promise<string>;
  askBedrock: typeof defaultAskBedrock;
}

// Bounded concurrency for upserts: each upsert is a Get + conditional Put
// round-trip, so a fully sequential loop over thousands of items blows the
// Lambda timeout. Processing in fixed-size concurrent batches keeps DynamoDB
// (PAY_PER_REQUEST, no provisioned ceiling) busy without unbounded parallelism.
const UPSERT_CONCURRENCY = 25;

export async function runScrape(
  now: string,
  deps?: Partial<Deps>,
): Promise<SourceResult[]> {
  const sourceRepo =
    (deps?.sourceRepo as Deps["sourceRepo"]) ?? new SourceRepo();
  const itemRepo = (deps?.itemRepo as Deps["itemRepo"]) ?? new ItemRepo();
  const seed = deps?.seed ?? ensureSeedSources;
  const getConnector = deps?.getConnector ?? defaultGetConnector;
  const configRepo = deps?.configRepo ?? new ConfigRepo();
  const runAi = deps?.runAiSource ?? defaultRunAiSource;
  const fetchText = deps?.fetchText ?? ((url: string) => safeFetchText(url));
  const askBedrock = deps?.askBedrock ?? defaultAskBedrock;

  await seed(sourceRepo as SourceRepo);
  // Config is read lazily — only when the first AI source is encountered,
  // avoiding a DynamoDB round-trip when no AI sources are enabled.
  let config: Awaited<ReturnType<typeof configRepo.get>> | undefined;
  const getConfig = async () => {
    if (!config) config = await configRepo.get();
    return config;
  };
  const sources = await sourceRepo.listEnabled();
  const results: SourceResult[] = [];

  for (const source of sources) {
    const result: SourceResult = {
      sourceId: source.id,
      fetched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
    };
    const next: Source = { ...source, lastRun: now };
    try {
      let items;
      if (source.connector === "ai") {
        const cfg = await getConfig();
        const r = await runAi(source, now, cfg.bedrockModelId, {
          fetchText,
          askBedrock,
        });
        next.lastContentHash = r.nextHash;
        if (r.nextExtractAt) next.lastExtractAt = r.nextExtractAt;
        items = r.items;
      } else {
        const connector = getConnector(source.id);
        if (!connector) throw new Error(`no connector for ${source.id}`);
        items = await connector.fetchItems();
      }
      result.fetched = items.length;
      for (let i = 0; i < items.length; i += UPSERT_CONCURRENCY) {
        const batch = items.slice(i, i + UPSERT_CONCURRENCY);
        const outcomes = await Promise.all(
          batch.map((item) => itemRepo.upsert(item, now)),
        );
        for (const r of outcomes) result[r] += 1;
      }
      next.lastStatus = "ok";
      next.errorMsg = undefined;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      next.lastStatus = "error";
      next.errorMsg = result.error;
    }
    await sourceRepo.put(next);
    results.push(result);
  }
  return results;
}

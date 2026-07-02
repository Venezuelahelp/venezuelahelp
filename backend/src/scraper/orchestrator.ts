import { SourceRepo } from "@/shared/repos/sourceRepo";
import { ItemRepo } from "@/shared/repos/itemRepo";
import { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
import { getConnector as defaultGetConnector } from "@/connectors/registry";
import { ensureSeedSources } from "@/scraper/seed";
import {
  runAiSource as defaultRunAiSource,
  AI_EXTRACT_MODEL,
} from "@/connectors/aiConnector";
import { runRestSource as defaultRunRestSource } from "@/connectors/restEngine";
import { fetchJson as defaultFetchJson } from "@/connectors/http";
import { safeFetchText } from "@/connectors/ssrf";
import { askBedrockTool as defaultExtract } from "@/telegram/bedrock";
import { logger } from "@/shared/logger";
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
  runAiSource: typeof defaultRunAiSource;
  runRestSource: typeof defaultRunRestSource;
  fetchJson: typeof defaultFetchJson;
  fetchText: (url: string) => Promise<string>;
  extract: typeof defaultExtract;
  scrapeRunRepo: Pick<ScrapeRunRepo, "put">;
  nowMs: () => number;
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
  const runAi = deps?.runAiSource ?? defaultRunAiSource;
  const runRest = deps?.runRestSource ?? defaultRunRestSource;
  const fetchJson = deps?.fetchJson ?? defaultFetchJson;
  const fetchText = deps?.fetchText ?? ((url: string) => safeFetchText(url));
  const extract = deps?.extract ?? defaultExtract;

  await seed(sourceRepo as SourceRepo);
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
        const r = await runAi(source, now, AI_EXTRACT_MODEL, {
          fetchText,
          extract,
        });
        next.lastContentHash = r.nextHash;
        if (r.nextExtractAt) next.lastExtractAt = r.nextExtractAt;
        items = r.items;
      } else if (source.connector === "rest") {
        if (!source.rest)
          throw new Error(`source ${source.id} sin rest config`);
        const r = await runRest(source.id, source.rest, { fetchJson });
        items = r.items;
        next.endpointStats = r.endpointStats;
      } else {
        const connector = getConnector(source.id);
        if (!connector) throw new Error(`no connector for ${source.id}`);
        items = await connector.fetchItems();
      }
      result.fetched = items.length;
      next.lastFetched = items.length;
      for (let i = 0; i < items.length; i += UPSERT_CONCURRENCY) {
        const batch = items.slice(i, i + UPSERT_CONCURRENCY);
        const outcomes = await Promise.all(
          batch.map((item) => itemRepo.upsert(item, now)),
        );
        for (const r of outcomes) result[r] += 1;
      }
      // Una fuente `rest` cuyos endpoints fallaron todos cuenta como error
      // (deja de ser un fallo silencioso). El estado "blocked" no se degrada.
      const allEndpointsFailed =
        source.connector === "rest" &&
        (next.endpointStats?.length ?? 0) > 0 &&
        next.endpointStats!.every((s) => s.error);
      if (source.status === "blocked") {
        next.status = "blocked";
        next.lastStatus = "ok";
      } else if (allEndpointsFailed) {
        next.lastStatus = "error";
        next.status = "error";
        next.errorMsg = next.endpointStats!.map((s) => s.error).join("; ");
        result.error = next.errorMsg;
      } else {
        next.lastStatus = "ok";
        next.status = "ok";
        next.errorMsg = undefined;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      next.lastStatus = "error";
      next.status = "error";
      next.errorMsg = result.error;
    }
    await sourceRepo.put(next);
    results.push(result);
  }
  // Historial de scrapes (best-effort): resuelve el "fire-and-forget" — el
  // admin ve cuándo terminó de verdad cada corrida. Un fallo al guardar el
  // historial NO puede romper el scrape que acaba de completarse.
  const scrapeRunRepo = deps?.scrapeRunRepo ?? new ScrapeRunRepo();
  const nowMs = deps?.nowMs ?? Date.now;
  try {
    const failed = results.filter((r) => r.error);
    await scrapeRunRepo.put({
      ts: now,
      durationMs: Math.max(0, nowMs() - Date.parse(now)),
      sourcesTotal: results.length,
      sourcesOk: results.length - failed.length,
      sourcesError: failed.length,
      created: results.reduce((n, r) => n + r.created, 0),
      updated: results.reduce((n, r) => n + r.updated, 0),
      unchanged: results.reduce((n, r) => n + r.unchanged, 0),
      errors: failed.slice(0, 10).map((r) => ({
        sourceId: r.sourceId,
        error: (r.error ?? "").slice(0, 300),
      })),
    });
  } catch (err) {
    logger.warn("no se pudo guardar el historial del scrape", { err });
  }
  return results;
}

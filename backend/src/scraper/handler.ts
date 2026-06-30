import { logger } from "@/shared/logger";
import { runScrape, type SourceResult } from "@/scraper/orchestrator";
import { buildSnapshot } from "@/public-snapshot/snapshot";
import { ensureBotApiKey } from "@/data-api/botKey";

export async function handler(): Promise<{
  sources: SourceResult[];
  snapshot: { key: string; count: number };
}> {
  const now = new Date().toISOString();
  try {
    const r = await ensureBotApiKey({ now });
    if (r.created) logger.info("API key interna del bot creada");
  } catch (e) {
    logger.warn("no se pudo aprovisionar la API key del bot", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const sources = await runScrape(now);
  const snapshot = await buildSnapshot(now);
  logger.info("scrape complete", { sources, snapshot });
  return { sources, snapshot };
}

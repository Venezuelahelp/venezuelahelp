import { logger } from "@/shared/logger";
import { runScrape, type SourceResult } from "@/scraper/orchestrator";
import { buildSnapshot } from "@/public-snapshot/snapshot";

export async function handler(): Promise<{
  sources: SourceResult[];
  snapshot: { key: string; count: number };
}> {
  const now = new Date().toISOString();
  const sources = await runScrape(now);
  const snapshot = await buildSnapshot(now);
  logger.info("scrape complete", { sources, snapshot });
  return { sources, snapshot };
}

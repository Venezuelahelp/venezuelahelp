import { describe, it, expect, vi } from "vitest";

vi.mock("@/scraper/orchestrator", () => ({
  runScrape: vi.fn(async () => [
    { sourceId: "s", fetched: 1, created: 1, updated: 0, unchanged: 0 },
  ]),
}));
vi.mock("@/public-snapshot/snapshot", () => ({
  buildSnapshot: vi.fn(async () => ({ key: "snapshot.json", count: 1 })),
}));
vi.mock("@/data-api/botKey", () => ({
  ensureBotApiKey: vi.fn(async () => ({ created: false })),
}));

import { handler } from "@/scraper/handler";
import { runScrape } from "@/scraper/orchestrator";
import { buildSnapshot } from "@/public-snapshot/snapshot";
import { ensureBotApiKey } from "@/data-api/botKey";

describe("scraper handler", () => {
  it("runs scrape then snapshot with the same timestamp and returns the summary", async () => {
    const res = await handler();
    expect(res.sources[0].created).toBe(1);
    expect(res.snapshot.count).toBe(1);
    const scrapeNow = (runScrape as any).mock.calls[0][0];
    const snapNow = (buildSnapshot as any).mock.calls[0][0];
    expect(scrapeNow).toBe(snapNow);
  });

  it("completes the scrape even if ensureBotApiKey throws", async () => {
    vi.mocked(ensureBotApiKey).mockRejectedValueOnce(new Error("ssm error"));
    const res = await handler();
    expect(res.sources[0].created).toBe(1);
    expect(res.snapshot.count).toBe(1);
  });
});

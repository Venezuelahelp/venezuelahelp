import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
import type { ScrapeRun } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const run: ScrapeRun = {
  ts: "2026-07-02T00:28:00.000Z",
  durationMs: 660000,
  sourcesTotal: 11,
  sourcesOk: 10,
  sourcesError: 1,
  created: 12,
  updated: 340,
  unchanged: 45000,
  errors: [{ sourceId: "bad", error: "HTTP 500" }],
};

describe("ScrapeRunRepo", () => {
  it("guarda la corrida bajo la partición compartida SCRAPERUN / SK=ts con TTL 30 días", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new ScrapeRunRepo().put(run);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "SCRAPERUN",
      SK: "2026-07-02T00:28:00.000Z",
      sourcesTotal: 11,
      created: 12,
      errors: [{ sourceId: "bad", error: "HTTP 500" }],
    });
    const expectedTtl =
      Math.floor(Date.parse(run.ts) / 1000) + 30 * 24 * 60 * 60;
    expect(item?.ttl).toBe(expectedTtl);
  });

  it("list usa Query sobre la partición compartida (NO Scan), más reciente primero", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ PK: "SCRAPERUN", SK: run.ts, ttl: 123, ...run }],
    });
    const runs = await new ScrapeRunRepo().list();
    expect(runs).toEqual([run]);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.KeyConditionExpression).toContain("PK = :pk");
    expect(input.ExpressionAttributeValues).toMatchObject({
      ":pk": "SCRAPERUN",
    });
    expect(input.ScanIndexForward).toBe(false);
    expect(input.Limit).toBe(10);
  });

  it("list respeta el limit pedido", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await new ScrapeRunRepo().list(3);
    expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.Limit).toBe(3);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { VisitRepo } from "@/shared/repos/visitRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const NOW = "2026-06-26T12:00:00.000Z";

describe("VisitRepo.record", () => {
  it("writes one VISIT event with a 90d ttl and no IP", async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});
    await new VisitRepo().record({
      country: "VE",
      browser: "Chrome",
      device: "mobile",
      os: "Android",
      path: "/",
      referrer: "",
      now: NOW,
    });
    const put = ddbMock.commandCalls(PutCommand)[0].args[0].input as any;
    expect(put.Item.PK).toBe("VISIT#2026-06-26");
    expect(put.Item.country).toBe("VE");
    expect(put.Item).not.toHaveProperty("ip");
    const epoch = Math.floor(Date.parse(NOW) / 1000);
    expect(put.Item.ttl).toBe(epoch + 90 * 24 * 60 * 60);
  });

  it("increments four aggregate counters (total + country/browser/device)", async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});
    await new VisitRepo().record({
      country: "VE",
      browser: "Chrome",
      device: "mobile",
      os: "Android",
      path: "/",
      referrer: "",
      now: NOW,
    });
    const sks = ddbMock
      .commandCalls(UpdateCommand)
      .map((c) => (c.args[0].input as any).Key.SK);
    expect(sks).toEqual(
      expect.arrayContaining([
        "2026-06-26#_total",
        "2026-06-26#country#VE",
        "2026-06-26#browser#Chrome",
        "2026-06-26#device#mobile",
      ]),
    );
    const first = ddbMock.commandCalls(UpdateCommand)[0].args[0].input as any;
    expect(first.Key.PK).toBe("VSTAT");
    expect(first.UpdateExpression).toContain("ADD");
  });
});

describe("VisitRepo.statsRange", () => {
  it("aggregates counters by dimension over the range", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { SK: "2026-06-26#_total", count: 5 },
        { SK: "2026-06-25#_total", count: 3 },
        { SK: "2026-06-26#country#VE", count: 4 },
        { SK: "2026-06-26#country#US", count: 1 },
        { SK: "2026-06-26#browser#Chrome", count: 6 },
        { SK: "2026-06-26#device#mobile", count: 8 },
      ],
    });
    const r = await new VisitRepo().statsRange("2026-06-25", "2026-06-26");
    expect(r.total).toBe(8);
    expect(r.byCountry).toEqual({ VE: 4, US: 1 });
    expect(r.byBrowser).toEqual({ Chrome: 6 });
    expect(r.byDevice).toEqual({ mobile: 8 });
  });
});

describe("VisitRepo.analytics", () => {
  it("returns KPIs, sorted dimensions and recent events", async () => {
    ddbMock.on(QueryCommand).callsFake((input: any) => {
      // VSTAT range queries vs VISIT recent queries
      if (input.ExpressionAttributeValues[":pk"] === "VSTAT") {
        return {
          Items: [
            { SK: "2026-06-26#_total", count: 10 },
            { SK: "2026-06-26#country#VE", count: 7 },
            { SK: "2026-06-26#country#US", count: 3 },
          ],
        };
      }
      // Solo la partición de hoy trae la visita; ayer va vacía.
      if (input.ExpressionAttributeValues[":pk"] === "VISIT#2026-06-26") {
        return {
          Items: [
            {
              ts: NOW,
              country: "VE",
              browser: "Chrome",
              device: "mobile",
              os: "Android",
              path: "/",
              referrer: "",
            },
          ],
        };
      }
      return { Items: [] };
    });
    const r = await new VisitRepo().analytics(NOW);
    expect(r.kpis.today).toBe(10);
    expect(r.kpis.last30).toBe(10);
    expect(r.byCountry[0]).toEqual({ key: "VE", count: 7 });
    expect(r.byCountry[1]).toEqual({ key: "US", count: 3 });
    expect(r.recent).toHaveLength(1);
    expect(r.recent[0].country).toBe("VE");
  });
});

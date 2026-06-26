import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConfigRepo } from "@/shared/repos/configRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

describe("ConfigRepo", () => {
  it("returns defaults when no config stored", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const cfg = await new ConfigRepo().get();
    expect(cfg.scrapeRateMin).toBe(30);
    expect(cfg.botTriggerMode).toBe("mention");
  });

  it("returns stored config when present", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "CONFIG",
        SK: "GLOBAL",
        scrapeRateMin: 15,
        bedrockModelId: "x",
        systemPrompt: "p",
        botTriggerMode: "all",
      },
    });
    const cfg = await new ConfigRepo().get();
    expect(cfg.scrapeRateMin).toBe(15);
    expect(cfg.botTriggerMode).toBe("all");
  });

  it("writes config with the CONFIG#GLOBAL key", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new ConfigRepo().put({
      scrapeRateMin: 20,
      bedrockModelId: "m",
      systemPrompt: "s",
      botTriggerMode: "command",
      enrichment: {
        geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
        blocklist: [],
        jaccardThreshold: 0.6,
        geoCellSize: 0.01,
        minTextLen: 10,
      },
    });
    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      PK: "CONFIG",
      SK: "GLOBAL",
      scrapeRateMin: 20,
    });
  });

  it("incluye defaults de enrichment cuando no hay Item", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const cfg = await new ConfigRepo().get();
    expect(cfg.enrichment.jaccardThreshold).toBe(0.7);
    expect(cfg.enrichment.geoCellSize).toBe(0.01);
    expect(cfg.enrichment.geocerca).toMatchObject({
      latMin: 0.6,
      latMax: 12.2,
    });
    expect(Array.isArray(cfg.enrichment.blocklist)).toBe(true);
  });

  it("usa enrichment persistido si existe", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        scrapeRateMin: 30,
        bedrockModelId: "amazon.nova-lite-v1:0",
        systemPrompt: "x",
        botTriggerMode: "mention",
        enrichment: {
          geocerca: { latMin: 1, latMax: 2, lngMin: -3, lngMax: -1 },
          blocklist: ["xxx"],
          jaccardThreshold: 0.8,
          geoCellSize: 0.05,
          minTextLen: 20,
        },
      },
    });
    const cfg = await new ConfigRepo().get();
    expect(cfg.enrichment.jaccardThreshold).toBe(0.8);
    expect(cfg.enrichment.blocklist).toEqual(["xxx"]);
  });
});

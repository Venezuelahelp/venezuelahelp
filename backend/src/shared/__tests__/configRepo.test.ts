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
    });
    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      PK: "CONFIG",
      SK: "GLOBAL",
      scrapeRateMin: 20,
    });
  });
});

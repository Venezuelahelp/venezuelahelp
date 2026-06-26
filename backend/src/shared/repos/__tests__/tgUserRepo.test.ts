import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { TgUserRepo } from "@/shared/repos/tgUserRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const NOW = "2026-06-26T12:00:00.000Z";

describe("TgUserRepo.upsert", () => {
  it("sets identity + lastSeenAt, fixes firstSeenAt once, increments msgCount", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await new TgUserRepo().upsert({
      chatId: 42,
      username: "manu",
      firstName: "Manuel",
      languageCode: "es",
      now: NOW,
    });
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input as any;
    expect(input.Key).toEqual({ PK: "TGUSER", SK: "42" });
    expect(input.UpdateExpression).toContain("if_not_exists(firstSeenAt");
    expect(input.UpdateExpression).toContain("ADD msgCount :one");
    expect(input.ExpressionAttributeValues[":un"]).toBe("manu");
    expect(input.ExpressionAttributeValues[":fn"]).toBe("Manuel");
    expect(input.ExpressionAttributeValues[":lc"]).toBe("es");
  });
});

describe("TgUserRepo.list", () => {
  it("returns users sorted by lastSeenAt desc, without PK/SK", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: "TGUSER",
          SK: "1",
          chatId: 1,
          lastSeenAt: "2026-06-20T00:00:00Z",
          firstSeenAt: "2026-06-01T00:00:00Z",
          msgCount: 2,
        },
        {
          PK: "TGUSER",
          SK: "2",
          chatId: 2,
          lastSeenAt: "2026-06-26T00:00:00Z",
          firstSeenAt: "2026-06-10T00:00:00Z",
          msgCount: 9,
        },
      ],
    });
    const users = await new TgUserRepo().list();
    expect(users[0].chatId).toBe(2); // más reciente primero
    expect(users[1].chatId).toBe(1);
    expect(users[0]).not.toHaveProperty("PK");
    expect(users[0]).not.toHaveProperty("SK");
  });
});

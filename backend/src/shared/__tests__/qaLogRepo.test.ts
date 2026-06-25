import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import type { QaLogEntry } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const entry: QaLogEntry = {
  chatId: "123",
  ts: "2026-06-25T00:00:00Z",
  pregunta: "?",
  respuesta: "!",
  itemsUsados: ["CAT#reportes/sismo#1"],
  tokensIn: 10,
  tokensOut: 5,
  modelo: "amazon.nova-lite-v1:0",
  costoEstimado: 0.0001,
  flagged: false,
};

describe("QaLogRepo", () => {
  it("appends under QA#chatId / ts", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new QaLogRepo().append(entry);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "QA#123",
      SK: "2026-06-25T00:00:00Z",
      pregunta: "?",
    });
  });

  it("listByChat queries newest first with a limit", async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [{ ...entry, PK: "QA#123", SK: entry.ts }] });
    const items = await new QaLogRepo().listByChat("123", 50);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ScanIndexForward).toBe(false);
    expect(input.Limit).toBe(50);
    expect(items[0].pregunta).toBe("?");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import type { QaLogEntry } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

describe("QaLogRepo", () => {
  it("persiste el intent opcional dentro del Item QA#", async () => {
    ddbMock.on(PutCommand).resolves({});
    const entry: QaLogEntry = {
      chatId: "9",
      ts: "2026-07-02T12:00:00.000Z",
      pregunta: "hola",
      respuesta: "¡Hola!",
      itemsUsados: [],
      tokensIn: 0,
      tokensOut: 0,
      modelo: "m",
      costoEstimado: 0,
      flagged: false,
      intent: "greeting",
    };
    await new QaLogRepo().append(entry);
    const put = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(put.Item).toMatchObject({
      PK: "QA#9",
      SK: "2026-07-02T12:00:00.000Z",
      intent: "greeting",
    });
  });

  it("sigue aceptando entradas SIN intent (retrocompatible)", async () => {
    ddbMock.on(PutCommand).resolves({});
    const entry: QaLogEntry = {
      chatId: "9",
      ts: "2026-07-02T12:00:00.000Z",
      pregunta: "q",
      respuesta: "r",
      itemsUsados: [],
      tokensIn: 0,
      tokensOut: 0,
      modelo: "m",
      costoEstimado: 0,
      flagged: false,
    };
    await new QaLogRepo().append(entry);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
  });
});

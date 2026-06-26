import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { QA_PK } from "@/shared/keys";
import type { QaLogEntry } from "@/shared/types";

function toEntry(item: Record<string, unknown>): QaLogEntry {
  const { PK, SK, ...rest } = item;
  return rest as unknown as QaLogEntry;
}

// Retención de logs Q&A: las preguntas de los usuarios son datos personales,
// así que se auto-eliminan vía TTL de DynamoDB (atributo `ttl`) pasado este
// plazo. No guardamos el historial indefinidamente.
const RETENTION_DAYS = 30;

export class QaLogRepo {
  async append(e: QaLogEntry): Promise<void> {
    const ttl =
      Math.floor(Date.parse(e.ts) / 1000) + RETENTION_DAYS * 24 * 60 * 60;
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: QA_PK(e.chatId), SK: e.ts, ...e, ttl },
      }),
    );
  }

  async listByChat(chatId: string, limit = 50): Promise<QaLogEntry[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": QA_PK(chatId) },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map(toEntry);
  }
}

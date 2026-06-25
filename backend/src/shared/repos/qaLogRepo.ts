import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { QA_PK } from "@/shared/keys";
import type { QaLogEntry } from "@/shared/types";

function toEntry(item: Record<string, unknown>): QaLogEntry {
  const { PK, SK, ...rest } = item;
  return rest as unknown as QaLogEntry;
}

export class QaLogRepo {
  async append(e: QaLogEntry): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: QA_PK(e.chatId), SK: e.ts, ...e },
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

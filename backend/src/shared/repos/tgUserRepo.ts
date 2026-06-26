import { UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { TGUSER_PK } from "@/shared/keys";

export interface TgUserUpsert {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  now: string; // ISO
}

export interface TgUserRecord {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  msgCount: number;
}

export class TgUserRepo {
  // Upsert idempotente por chatId: actualiza identidad y lastSeenAt, fija
  // firstSeenAt solo la primera vez, e incrementa msgCount. Las claves PK/SK no
  // se devuelven en el record (se filtran al listar).
  async upsert(u: TgUserUpsert): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: TGUSER_PK, SK: String(u.chatId) },
        UpdateExpression:
          "SET chatId = :id, lastSeenAt = :now, firstSeenAt = if_not_exists(firstSeenAt, :now)" +
          ", username = :un, firstName = :fn, lastName = :ln, languageCode = :lc" +
          " ADD msgCount :one",
        ExpressionAttributeValues: {
          ":id": u.chatId,
          ":now": u.now,
          ":un": u.username ?? null,
          ":fn": u.firstName ?? null,
          ":ln": u.lastName ?? null,
          ":lc": u.languageCode ?? null,
          ":one": 1,
        },
      }),
    );
  }

  async list(): Promise<TgUserRecord[]> {
    const users: TgUserRecord[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": TGUSER_PK },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) {
        const { PK, SK, ...rest } = it;
        void PK;
        void SK;
        users.push(rest as unknown as TgUserRecord);
      }
      ExclusiveStartKey = res.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return users.sort((a, b) =>
      (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
    );
  }
}

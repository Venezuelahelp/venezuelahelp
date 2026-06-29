import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { APIKEY_PK } from "@/shared/keys";
import type { ApiKey } from "@/shared/types";

const KEY_PREFIX = "vh_live_";

export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function toKey(item: Record<string, unknown>): ApiKey {
  const { PK, SK, ...rest } = item;
  return rest as unknown as ApiKey;
}

export interface CreateKeyInput {
  consumerName: string;
  email: string;
  requestId: string;
  createdAt: string;
}

export class ApiKeyRepo {
  // Genera la clave en claro, guarda solo su hash (como SK) y la devuelve UNA vez.
  async create(
    input: CreateKeyInput,
  ): Promise<{ rawKey: string; apiKey: ApiKey }> {
    const rawKey = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const apiKey: ApiKey = {
      keyId: randomUUID(),
      consumerName: input.consumerName,
      email: input.email,
      requestId: input.requestId,
      status: "active",
      createdAt: input.createdAt,
    };
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: APIKEY_PK, SK: hashKey(rawKey), ...apiKey },
      }),
    );
    return { rawKey, apiKey };
  }

  // Hot path del authorizer: GetItem O(1) por SK=hash en la partición APIKEY.
  async getByHash(hash: string): Promise<ApiKey | null> {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: APIKEY_PK, SK: hash },
      }),
    );
    return res.Item ? toKey(res.Item) : null;
  }

  // Query sobre la partición compartida (barato) — NO Scan de toda la tabla.
  async list(): Promise<ApiKey[]> {
    const items: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": APIKEY_PK },
          ExclusiveStartKey,
        }),
      );
      items.push(...(res.Items ?? []));
      ExclusiveStartKey = res.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return items.map(toKey);
  }

  // Revoca por keyId. La PK es fija y la SK es el hash; ubicamos la SK con un
  // Query a la partición (pocas keys) y filtrando por keyId del lado servidor.
  async revoke(keyId: string, revokedAt: string): Promise<boolean> {
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          FilterExpression: "keyId = :keyId",
          ExpressionAttributeValues: { ":pk": APIKEY_PK, ":keyId": keyId },
          ExclusiveStartKey,
        }),
      );
      const hit = (res.Items ?? [])[0];
      if (hit) {
        await ddb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: APIKEY_PK, SK: hit.SK as string },
            UpdateExpression: "SET #status = :status, revokedAt = :revokedAt",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":status": "revoked",
              ":revokedAt": revokedAt,
            },
          }),
        );
        return true;
      }
      ExclusiveStartKey = res.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return false;
  }
}

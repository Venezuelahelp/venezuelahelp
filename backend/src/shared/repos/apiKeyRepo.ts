import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { APIKEY_PK, APIKEY_SK } from "@/shared/keys";
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
  // Genera la clave en claro, guarda solo su hash y la devuelve UNA vez.
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
        Item: { PK: APIKEY_PK(hashKey(rawKey)), SK: APIKEY_SK, ...apiKey },
      }),
    );
    return { rawKey, apiKey };
  }

  async getByHash(hash: string): Promise<ApiKey | null> {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: APIKEY_PK(hash), SK: APIKEY_SK },
      }),
    );
    return res.Item ? toKey(res.Item) : null;
  }

  async list(): Promise<ApiKey[]> {
    const items: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "SK = :sk",
          ExpressionAttributeValues: { ":sk": APIKEY_SK },
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

  // Revoca por keyId. Como la PK es el hash (no el keyId), escaneamos para
  // ubicar la PK real; el volumen de keys es bajo (pocos terceros).
  async revoke(keyId: string, revokedAt: string): Promise<boolean> {
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "SK = :sk AND keyId = :keyId",
          ExpressionAttributeValues: { ":sk": APIKEY_SK, ":keyId": keyId },
          ExclusiveStartKey,
        }),
      );
      const hit = (res.Items ?? [])[0];
      if (hit) {
        await ddb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: hit.PK as string, SK: APIKEY_SK },
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

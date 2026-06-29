import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { APIREQ_PK } from "@/shared/keys";
import type { ApiAccessRequest } from "@/shared/types";

function toRequest(item: Record<string, unknown>): ApiAccessRequest {
  const { PK, SK, ...rest } = item;
  return rest as unknown as ApiAccessRequest;
}

export interface SetStatusInput {
  status: ApiAccessRequest["status"];
  reviewedBy: string;
  reviewedAt: string;
  apiKeyId?: string;
}

export class ApiRequestRepo {
  async put(r: ApiAccessRequest): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: APIREQ_PK, SK: r.id, ...r },
      }),
    );
  }

  async get(id: string): Promise<ApiAccessRequest | null> {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: APIREQ_PK, SK: id },
      }),
    );
    return res.Item ? toRequest(res.Item) : null;
  }

  // Query sobre la partición compartida (barato) — NO Scan de toda la tabla.
  async list(): Promise<ApiAccessRequest[]> {
    const items: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": APIREQ_PK },
          ExclusiveStartKey,
        }),
      );
      items.push(...(res.Items ?? []));
      ExclusiveStartKey = res.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
    return items.map(toRequest);
  }

  async setStatus(id: string, input: SetStatusInput): Promise<void> {
    const sets = [
      "#status = :status",
      "reviewedBy = :reviewedBy",
      "reviewedAt = :reviewedAt",
    ];
    const values: Record<string, unknown> = {
      ":status": input.status,
      ":reviewedBy": input.reviewedBy,
      ":reviewedAt": input.reviewedAt,
    };
    if (input.apiKeyId !== undefined) {
      sets.push("apiKeyId = :apiKeyId");
      values[":apiKeyId"] = input.apiKeyId;
    }
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: APIREQ_PK, SK: id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        // `status` es palabra reservada en DynamoDB.
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: values,
      }),
    );
  }
}

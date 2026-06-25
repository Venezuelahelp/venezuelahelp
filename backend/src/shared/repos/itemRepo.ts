import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { itemKey, contentHash } from "@/shared/keys";
import type { Category, NormalizedItem, StoredItem } from "@/shared/types";

export class ItemRepo {
  async upsert(
    item: NormalizedItem,
    now: string,
  ): Promise<"created" | "updated" | "unchanged"> {
    const key = itemKey(item.category, item.sourceId, item.externalId);
    const hash = contentHash(item);

    const existing = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: key }),
    );

    if (existing.Item && existing.Item.contentHash === hash) {
      return "unchanged";
    }

    const firstSeenAt =
      (existing.Item?.firstSeenAt as string | undefined) ?? now;
    const stored: StoredItem & { PK: string; SK: string } = {
      ...key,
      ...item,
      contentHash: hash,
      firstSeenAt,
      lastSeenAt: now,
    };

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: stored }));
    return existing.Item ? "updated" : "created";
  }

  async listByCategory(category: Category): Promise<StoredItem[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `CAT#${category}` },
      }),
    );
    const items = (res.Items ?? []) as unknown as StoredItem[];
    return items.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }
}

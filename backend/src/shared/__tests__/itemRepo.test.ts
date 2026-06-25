import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ItemRepo } from "@/shared/repos/itemRepo";
import type { NormalizedItem } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const item: NormalizedItem = {
  category: "reportes",
  sourceId: "sismo",
  externalId: "1",
  titulo: "t",
  texto: "x",
  raw: {},
};

describe("ItemRepo.upsert", () => {
  it("returns 'created' when item did not exist", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    const res = await new ItemRepo().upsert(item, "2026-06-25T00:00:00Z");
    expect(res).toBe("created");
    const stored = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(stored).toMatchObject({
      PK: "CAT#reportes",
      SK: "sismo#1",
      firstSeenAt: "2026-06-25T00:00:00Z",
    });
  });

  it("returns 'unchanged' and skips write when hash matches", async () => {
    const { contentHash } = await import("@/shared/keys");
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "CAT#reportes",
        SK: "sismo#1",
        contentHash: contentHash(item),
        firstSeenAt: "old",
      },
    });
    const res = await new ItemRepo().upsert(item, "2026-06-25T01:00:00Z");
    expect(res).toBe("unchanged");
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("returns 'updated' and preserves firstSeenAt when content changed", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "CAT#reportes",
        SK: "sismo#1",
        contentHash: "different",
        firstSeenAt: "2026-06-01T00:00:00Z",
      },
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await new ItemRepo().upsert(item, "2026-06-25T02:00:00Z");
    expect(res).toBe("updated");
    const stored = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(stored).toMatchObject({
      firstSeenAt: "2026-06-01T00:00:00Z",
      lastSeenAt: "2026-06-25T02:00:00Z",
    });
  });
});

describe("ItemRepo.listByCategory", () => {
  it("queries the category partition and sorts by lastSeenAt desc", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: "CAT#reportes",
          SK: "sismo#1",
          lastSeenAt: "2026-06-25T00:00:00Z",
          titulo: "a",
        },
        {
          PK: "CAT#reportes",
          SK: "sismo#2",
          lastSeenAt: "2026-06-26T00:00:00Z",
          titulo: "b",
        },
      ],
    });
    const items = await new ItemRepo().listByCategory("reportes");
    expect(items.map((i) => i.titulo)).toEqual(["b", "a"]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SourceRepo } from "@/shared/repos/sourceRepo";
import type { Source } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const src: Source = {
  id: "sismo",
  nombre: "SismoVenezuela",
  url: "https://www.sismovenezuela.com/",
  connector: "jsonApi",
  enabled: true,
};

function sourceItem(id: string, enabled = true) {
  return {
    PK: "SOURCE",
    SK: id,
    id,
    enabled,
    nombre: id.toUpperCase(),
    url: "u",
    connector: "jsonApi",
  };
}

describe("SourceRepo", () => {
  it("stores a source under the shared partition PK=SOURCE / SK=id", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new SourceRepo().put(src);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "SOURCE",
      SK: "sismo",
      id: "sismo",
      enabled: true,
    });
  });

  it("gets a source by PK=SOURCE / SK=id", async () => {
    ddbMock.on(GetCommand).resolves({ Item: sourceItem("sismo") });
    const got = await new SourceRepo().get("sismo");
    const key = ddbMock.commandCalls(GetCommand)[0].args[0].input.Key;
    expect(key).toEqual({ PK: "SOURCE", SK: "sismo" });
    expect(got?.id).toBe("sismo");
  });

  it("list Queries the shared partition (no full-table Scan)", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [sourceItem("a")] });
    await new SourceRepo().list();
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.KeyConditionExpression).toContain("PK");
    expect(input.ExpressionAttributeValues).toMatchObject({ ":pk": "SOURCE" });
  });

  it("listEnabled filters out disabled sources", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [sourceItem("a", true), sourceItem("b", false)],
    });
    const enabled = await new SourceRepo().listEnabled();
    expect(enabled.map((s) => s.id)).toEqual(["a"]);
  });

  it("follows pagination across multiple pages in list", async () => {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [sourceItem("a")],
        LastEvaluatedKey: { PK: "SOURCE", SK: "a" },
      })
      .resolvesOnce({ Items: [sourceItem("b")] });
    const all = await new SourceRepo().list();
    expect(all.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("delete removes the source by PK=SOURCE / SK=id", async () => {
    ddbMock.on(DeleteCommand).resolves({});
    await new SourceRepo().delete("sismo");
    const key = ddbMock.commandCalls(DeleteCommand)[0].args[0].input.Key;
    expect(key).toEqual({ PK: "SOURCE", SK: "sismo" });
  });
});

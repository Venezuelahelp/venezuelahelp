import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ApiKeyRepo } from "@/shared/repos/apiKeyRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

describe("ApiKeyRepo", () => {
  it("create returns a raw key once and stores only its sha256 as PK", async () => {
    ddbMock.on(PutCommand).resolves({});
    const { rawKey, apiKey } = await new ApiKeyRepo().create({
      consumerName: "Cruz Roja",
      email: "datos@cruzroja.org",
      requestId: "req-1",
      createdAt: "2026-06-29T00:00:00.000Z",
    });

    // El valor en claro tiene el prefijo reconocible y se entrega una vez.
    expect(rawKey).toMatch(/^vh_live_/);
    expect(apiKey.status).toBe("active");
    expect(apiKey.keyId).toBeTruthy();

    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item as Record<
      string,
      unknown
    >;
    const hash = createHash("sha256").update(rawKey).digest("hex");
    expect(item.PK).toBe(`APIKEY#${hash}`);
    expect(item.SK).toBe("KEY");
    // El valor en claro NUNCA se persiste.
    expect(JSON.stringify(item)).not.toContain(rawKey);
  });

  it("getByHash reads by APIKEY#hash / KEY", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "APIKEY#deadbeef",
        SK: "KEY",
        keyId: "k1",
        consumerName: "X",
        email: "x@x.com",
        requestId: "r1",
        status: "active",
        createdAt: "2026-06-29T00:00:00.000Z",
      },
    });
    const got = await new ApiKeyRepo().getByHash("deadbeef");
    expect(got?.keyId).toBe("k1");
    const key = ddbMock.commandCalls(GetCommand)[0].args[0].input.Key;
    expect(key).toEqual({ PK: "APIKEY#deadbeef", SK: "KEY" });
  });

  it("list scans filtering SK = KEY", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          PK: "APIKEY#h1",
          SK: "KEY",
          keyId: "k1",
          consumerName: "X",
          email: "x@x.com",
          requestId: "r1",
          status: "active",
          createdAt: "2026-06-29T00:00:00.000Z",
        },
      ],
    });
    const all = await new ApiKeyRepo().list();
    expect(all.map((k) => k.keyId)).toEqual(["k1"]);
    const input = ddbMock.commandCalls(ScanCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues).toMatchObject({ ":sk": "KEY" });
  });

  it("revoke finds the key by keyId and sets status revoked", async () => {
    // DynamoDB aplica el FilterExpression (SK=KEY AND keyId=k2) server-side, así
    // que el scan ya devuelve solo el match.
    ddbMock.on(ScanCommand).resolves({
      Items: [{ PK: "APIKEY#h2", SK: "KEY", keyId: "k2", status: "active" }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const ok = await new ApiKeyRepo().revoke("k2", "2026-06-29T02:00:00.000Z");
    expect(ok).toBe(true);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ PK: "APIKEY#h2", SK: "KEY" });
    expect(input.ExpressionAttributeValues).toMatchObject({
      ":status": "revoked",
      ":revokedAt": "2026-06-29T02:00:00.000Z",
    });
  });

  it("revoke returns false when the keyId is unknown", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const ok = await new ApiKeyRepo().revoke("nope", "2026-06-29T02:00:00.000Z");
    expect(ok).toBe(false);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});

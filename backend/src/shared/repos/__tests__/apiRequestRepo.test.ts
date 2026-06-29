import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ApiRequestRepo } from "@/shared/repos/apiRequestRepo";
import type { ApiAccessRequest } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const req: ApiAccessRequest = {
  id: "abc",
  nombre: "Cruz Roja",
  email: "datos@cruzroja.org",
  motivo: "Mostrar desaparecidos en nuestro portal",
  status: "pendiente",
  createdAt: "2026-06-29T00:00:00.000Z",
};

describe("ApiRequestRepo", () => {
  it("stores a request under APIREQ#id / REQ", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new ApiRequestRepo().put(req);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "APIREQ#abc",
      SK: "REQ",
      id: "abc",
      status: "pendiente",
    });
  });

  it("get reads by APIREQ#id / REQ and strips keys", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { PK: "APIREQ#abc", SK: "REQ", ...req } });
    const got = await new ApiRequestRepo().get("abc");
    expect(got).toEqual(req);
    const key = ddbMock.commandCalls(GetCommand)[0].args[0].input.Key;
    expect(key).toEqual({ PK: "APIREQ#abc", SK: "REQ" });
  });

  it("list scans filtering SK = REQ (not META, so no Sources)", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [{ PK: "APIREQ#abc", SK: "REQ", ...req }],
    });
    const all = await new ApiRequestRepo().list();
    expect(all.map((r) => r.id)).toEqual(["abc"]);
    const input = ddbMock.commandCalls(ScanCommand)[0].args[0].input;
    expect(input.ExpressionAttributeValues).toMatchObject({ ":sk": "REQ" });
  });

  it("setStatus updates status, reviewer and apiKeyId", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await new ApiRequestRepo().setStatus("abc", {
      status: "aprobada",
      reviewedBy: "admin@x.com",
      reviewedAt: "2026-06-29T01:00:00.000Z",
      apiKeyId: "key-1",
    });
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ PK: "APIREQ#abc", SK: "REQ" });
    expect(input.ExpressionAttributeValues).toMatchObject({
      ":status": "aprobada",
      ":reviewedBy": "admin@x.com",
      ":apiKeyId": "key-1",
    });
  });
});

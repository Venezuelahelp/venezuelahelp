import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSnapshotUpdatedAt } from "@/admin-api/snapshotHead";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
  vi.stubEnv("SNAPSHOT_BUCKET", "snap-bucket");
});
afterEach(() => vi.unstubAllEnvs());

describe("getSnapshotUpdatedAt", () => {
  it("devuelve el LastModified de snapshot.json en ISO", async () => {
    s3Mock.on(HeadObjectCommand).resolves({
      LastModified: new Date("2026-07-02T12:58:00Z"),
    });
    await expect(getSnapshotUpdatedAt()).resolves.toBe(
      "2026-07-02T12:58:00.000Z",
    );
    const input = s3Mock.commandCalls(HeadObjectCommand)[0].args[0].input;
    expect(input).toEqual({ Bucket: "snap-bucket", Key: "snapshot.json" });
  });

  it("devuelve undefined si el HeadObject falla (no tumba /stats)", async () => {
    s3Mock.on(HeadObjectCommand).rejects(new Error("AccessDenied"));
    await expect(getSnapshotUpdatedAt()).resolves.toBeUndefined();
  });

  it("devuelve undefined si la respuesta no trae LastModified", async () => {
    s3Mock.on(HeadObjectCommand).resolves({});
    await expect(getSnapshotUpdatedAt()).resolves.toBeUndefined();
  });

  it("devuelve undefined sin SNAPSHOT_BUCKET configurado (sin llamar a S3)", async () => {
    vi.stubEnv("SNAPSHOT_BUCKET", "");
    await expect(getSnapshotUpdatedAt()).resolves.toBeUndefined();
    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(0);
  });
});

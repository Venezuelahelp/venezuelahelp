import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { buildSnapshot } from "@/public-snapshot/snapshot";

const s3Mock = mockClient(S3Client);
beforeEach(() => {
  s3Mock.reset();
  process.env.SNAPSHOT_BUCKET = "bucket-x";
});

describe("buildSnapshot", () => {
  it("assembles categories and puts snapshot.json without raw field", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const itemRepo = {
      listByCategory: vi.fn(async (cat: string) =>
        cat === "reportes"
          ? [
              {
                category: "reportes",
                sourceId: "s",
                externalId: "1",
                titulo: "t",
                texto: "x",
                raw: { secret: true },
                contentHash: "h",
                firstSeenAt: "a",
                lastSeenAt: "b",
              },
            ]
          : [],
      ),
    };
    const res = await buildSnapshot("2026-06-25T00:00:00Z", {
      itemRepo: itemRepo as any,
    });
    expect(res.key).toBe("snapshot.json");
    expect(res.count).toBe(1);
    const body = JSON.parse(
      s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Body as string,
    );
    expect(body.categories.reportes[0]).not.toHaveProperty("raw");
    expect(body.categories.reportes[0].titulo).toBe("t");
    expect(body.generatedAt).toBe("2026-06-25T00:00:00Z");
  });
});

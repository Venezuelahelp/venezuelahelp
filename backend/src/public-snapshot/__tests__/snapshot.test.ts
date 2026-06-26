import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { buildSnapshot } from "@/public-snapshot/snapshot";
import type { Config } from "@/shared/types";

const s3Mock = mockClient(S3Client);
beforeEach(() => {
  s3Mock.reset();
  process.env.SNAPSHOT_BUCKET = "bucket-x";
});

const CONFIG: Config = {
  scrapeRateMin: 30,
  bedrockModelId: "amazon.nova-lite-v1:0",
  systemPrompt: "p",
  botTriggerMode: "mention",
  enrichment: {
    geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
    blocklist: [],
    jaccardThreshold: 0.6,
    geoCellSize: 0.01,
    minTextLen: 10,
  },
};

const configRepo = { get: async () => CONFIG };
const sourceRepo = { listEnabled: async () => [] };

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
                texto: "Texto suficientemente largo",
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
      itemRepo: itemRepo as never,
      configRepo: configRepo as never,
      sourceRepo: sourceRepo as never,
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

  it("incluye marcas de enrichment por ítem en el snapshot", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const items = [
      {
        category: "edificios",
        sourceId: "s1",
        externalId: "1",
        titulo: "Torre",
        texto: "Texto suficientemente largo",
        ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
        raw: {},
        contentHash: "h",
        firstSeenAt: "t",
        lastSeenAt: "2026-06-25T00:00:00Z",
      },
      {
        category: "edificios",
        sourceId: "s2",
        externalId: "9",
        titulo: "Edificio",
        texto: "Texto suficientemente largo",
        ubicacion: { lat: 10.501, lng: -66.901, nombre: "Chacao" },
        raw: {},
        contentHash: "h",
        firstSeenAt: "t",
        lastSeenAt: "2026-06-26T00:00:00Z",
      },
    ];
    const itemRepo = {
      listByCategory: async (cat: string) => (cat === "edificios" ? items : []),
    };
    await buildSnapshot("2026-06-26T12:00:00Z", {
      itemRepo: itemRepo as never,
      configRepo: configRepo as never,
      sourceRepo: sourceRepo as never,
    });
    const body = JSON.parse(
      s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Body as string,
    );
    const edif = body.categories.edificios;
    expect(edif).toHaveLength(2);
    expect(
      edif.every((i: { sourcesCount: number }) => i.sourcesCount === 2),
    ).toBe(true);
    expect(
      edif.every((i: { trust: string }) => i.trust === "corroborado"),
    ).toBe(true);
    expect(edif.some((i: { isCanonical: boolean }) => i.isCanonical)).toBe(
      true,
    );
    expect(edif[0].raw).toBeUndefined();
  });
});

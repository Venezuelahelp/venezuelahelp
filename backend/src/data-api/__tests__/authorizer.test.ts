import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { authorizer } from "@/data-api/authorizer";
import type { ApiKey } from "@/shared/types";

const RAW = "vh_live_secret";
const HASH = createHash("sha256").update(RAW).digest("hex");

const activeKey: ApiKey = {
  keyId: "k1",
  consumerName: "Cruz Roja",
  email: "x@x.com",
  requestId: "r1",
  status: "active",
  createdAt: "2026-06-29T00:00:00.000Z",
};

function ev(apiKey?: string) {
  return { headers: apiKey ? { "x-api-key": apiKey } : {} };
}

function deps(over: {
  getByHash?: (h: string) => Promise<ApiKey | null>;
  hit?: () => Promise<{ allowed: boolean; count: number }>;
} = {}) {
  return {
    apiKeyRepo: {
      getByHash: over.getByHash ?? (async () => activeKey),
    },
    rateLimit: {
      hit: over.hit ?? (async () => ({ allowed: true, count: 1 })),
    },
  };
}

describe("data-api authorizer", () => {
  it("allows a valid active key and returns context", async () => {
    const getByHash = vi.fn(async () => activeKey);
    const res = await authorizer(ev(RAW), deps({ getByHash }));
    expect(res.isAuthorized).toBe(true);
    expect(res.context).toMatchObject({ keyId: "k1", consumerName: "Cruz Roja" });
    // Hace el lookup por el hash del valor en claro, nunca por el valor.
    expect(getByHash).toHaveBeenCalledWith(HASH);
  });

  it("denies when the x-api-key header is missing", async () => {
    const res = await authorizer(ev(), deps());
    expect(res.isAuthorized).toBe(false);
  });

  it("denies an unknown key", async () => {
    const res = await authorizer(ev(RAW), deps({ getByHash: async () => null }));
    expect(res.isAuthorized).toBe(false);
  });

  it("denies a revoked key", async () => {
    const res = await authorizer(
      ev(RAW),
      deps({ getByHash: async () => ({ ...activeKey, status: "revoked" }) }),
    );
    expect(res.isAuthorized).toBe(false);
  });

  it("denies when the rate limit is exceeded", async () => {
    const res = await authorizer(
      ev(RAW),
      deps({ hit: async () => ({ allowed: false, count: 999 }) }),
    );
    expect(res.isAuthorized).toBe(false);
  });

  it("fails closed (deny) when the lookup throws", async () => {
    const res = await authorizer(
      ev(RAW),
      deps({
        getByHash: async () => {
          throw new Error("ddb down");
        },
      }),
    );
    expect(res.isAuthorized).toBe(false);
  });
});

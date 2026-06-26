import { describe, it, expect, vi } from "vitest";
import type { route as RouteType } from "@/admin-api/router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,PUT,PATCH,POST,OPTIONS",
};

describe("handler", () => {
  const stubRoute = vi.fn<
    Parameters<typeof RouteType>,
    ReturnType<typeof RouteType>
  >();

  beforeEach(() => {
    stubRoute.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function load() {
    const { handler } = await import("@/admin-api/handler");
    return handler;
  }

  it("returns 200 with CORS and JSON content-type headers and serialized body", async () => {
    const handler = await load();
    const event = {
      requestContext: { http: { method: "GET" } },
      rawPath: "/config",
    };

    const result = await handler(event, { route: stubRoute });

    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({
      ...CORS,
      "content-type": "application/json",
    });
    expect(result.body).toBe(JSON.stringify({ ok: true }));
  });

  it("calls route with method, path, and undefined body when no body", async () => {
    const handler = await load();
    const event = {
      requestContext: { http: { method: "GET" } },
      rawPath: "/config",
    };

    await handler(event, { route: stubRoute });

    expect(stubRoute).toHaveBeenCalledWith(
      "GET",
      "/config",
      undefined,
      expect.any(Object),
    );
  });

  it("parses body JSON and passes parsed object to route", async () => {
    const handler = await load();
    const payload = { scrapeRateMin: 60 };
    const event = {
      requestContext: { http: { method: "PUT" } },
      rawPath: "/config",
      body: JSON.stringify(payload),
    };

    await handler(event, { route: stubRoute });

    expect(stubRoute).toHaveBeenCalledWith(
      "PUT",
      "/config",
      payload,
      expect.any(Object),
    );
  });

  it("audit-logs mutating requests with the authenticated actor", async () => {
    const { logger } = await import("@/shared/logger");
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const handler = await load();
    const event = {
      requestContext: {
        http: { method: "PUT" },
        authorizer: { jwt: { claims: { sub: "u-1", email: "admin@x.com" } } },
      },
      rawPath: "/config",
      body: JSON.stringify({ scrapeRateMin: 60 }),
    };

    await handler(event, { route: stubRoute });

    expect(infoSpy).toHaveBeenCalledWith(
      "admin audit",
      expect.objectContaining({
        actor: "admin@x.com",
        method: "PUT",
        path: "/config",
        status: 200,
      }),
    );
  });

  it("does not audit-log read-only GET requests", async () => {
    const { logger } = await import("@/shared/logger");
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const handler = await load();
    const event = {
      requestContext: { http: { method: "GET" } },
      rawPath: "/config",
    };

    await handler(event, { route: stubRoute });

    expect(infoSpy).not.toHaveBeenCalledWith("admin audit", expect.anything());
  });

  it("returns 204 with only CORS headers on OPTIONS", async () => {
    const handler = await load();
    const event = {
      requestContext: { http: { method: "OPTIONS" } },
      rawPath: "/config",
    };

    const result = await handler(event, { route: stubRoute });

    expect(result.statusCode).toBe(204);
    expect(result.headers).toEqual(CORS);
    expect(result.body).toBe("");
    expect(stubRoute).not.toHaveBeenCalled();
  });

  it("returns 500 with error body when route throws", async () => {
    const handler = await load();
    stubRoute.mockRejectedValue(new Error("boom"));
    const event = {
      requestContext: { http: { method: "GET" } },
      rawPath: "/config",
    };

    const result = await handler(event, { route: stubRoute });

    expect(result.statusCode).toBe(500);
    expect(result.headers).toMatchObject({
      ...CORS,
      "content-type": "application/json",
    });
    expect(JSON.parse(result.body)).toEqual({ error: "internal error" });
  });

  it("POST /scrape calls lambda.send with InvokeCommand via real router", async () => {
    process.env.SCRAPER_FN_NAME = "test-scraper-fn";
    try {
      const mockSend = vi.fn().mockResolvedValue({});
      const handler = await load();
      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/scrape",
      };

      const result = await handler(event, { lambda: { send: mockSend } });

      expect(result.statusCode).toBe(202);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const invokeCmd = mockSend.mock.calls[0][0] as {
        input: Record<string, unknown>;
      };
      expect(invokeCmd.input).toMatchObject({
        FunctionName: "test-scraper-fn",
        InvocationType: "Event",
      });
    } finally {
      delete process.env.SCRAPER_FN_NAME;
    }
  });
});

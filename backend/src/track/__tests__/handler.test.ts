import { describe, it, expect, vi } from "vitest";
import { handler } from "@/track/handler";

const NOW = "2026-06-26T12:00:00.000Z";

function deps(record = vi.fn(async () => {})) {
  return { visitRepo: { record }, now: () => NOW };
}

describe("track handler", () => {
  it("records a visit with country from the CloudFront header and parsed UA", async () => {
    const record = vi.fn(async () => {});
    const res = await handler(
      {
        headers: {
          "CloudFront-Viewer-Country": "ve",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1",
        },
        body: JSON.stringify({ path: "/mapa", referrer: "https://t.co" }),
      },
      deps(record),
    );
    expect(res.statusCode).toBe(204);
    expect(record).toHaveBeenCalledOnce();
    const arg = record.mock.calls[0][0];
    expect(arg.country).toBe("VE");
    expect(arg.device).toBe("mobile");
    expect(arg.path).toBe("/mapa");
    expect(arg.referrer).toBe("https://t.co");
  });

  it("defaults country to ZZ when the header is missing", async () => {
    const record = vi.fn(async () => {});
    await handler({ headers: {}, body: "{}" }, deps(record));
    expect(record.mock.calls[0][0].country).toBe("ZZ");
  });

  it("clips path/referrer to 200 chars and ignores extra fields", async () => {
    const record = vi.fn(async () => {});
    await handler(
      {
        headers: {},
        body: JSON.stringify({ path: "x".repeat(500), evil: "y" }),
      },
      deps(record),
    );
    expect(record.mock.calls[0][0].path.length).toBe(200);
  });

  it("returns 204 even with an invalid JSON body", async () => {
    const record = vi.fn(async () => {});
    const res = await handler({ headers: {}, body: "not-json{" }, deps(record));
    expect(res.statusCode).toBe(204);
    expect(record).toHaveBeenCalledOnce();
  });

  it("returns 204 (never throws) when the repo write fails", async () => {
    const record = vi.fn(async () => {
      throw new Error("ddb down");
    });
    const res = await handler({ headers: {}, body: "{}" }, deps(record));
    expect(res.statusCode).toBe(204);
  });

  it("short-circuits OPTIONS preflight without recording", async () => {
    const record = vi.fn(async () => {});
    const res = await handler(
      { requestContext: { http: { method: "OPTIONS" } } },
      deps(record),
    );
    expect(res.statusCode).toBe(204);
    expect(record).not.toHaveBeenCalled();
  });
});

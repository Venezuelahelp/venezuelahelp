import { describe, it, expect } from "vitest";
import { parseUserAgent } from "@/track/userAgent";

describe("parseUserAgent", () => {
  it("detects Chrome on Windows desktop", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    );
    expect(r).toEqual({ browser: "Chrome", device: "desktop", os: "Windows" });
  });

  it("detects Safari on iPhone mobile", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(r.browser).toBe("Safari");
    expect(r.device).toBe("mobile");
    expect(r.os).toBe("iOS");
  });

  it("detects Chrome on Android mobile", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    );
    expect(r.browser).toBe("Chrome");
    expect(r.device).toBe("mobile");
    expect(r.os).toBe("Android");
  });

  it("detects an Android tablet (no Mobile token)", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    );
    expect(r.device).toBe("tablet");
    expect(r.os).toBe("Android");
  });

  it("detects iPad as tablet", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(r.device).toBe("tablet");
  });

  it("detects Edge over Chrome", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0",
    );
    expect(r.browser).toBe("Edge");
  });

  it("detects Firefox on macOS", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    );
    expect(r.browser).toBe("Firefox");
    expect(r.os).toBe("macOS");
    expect(r.device).toBe("desktop");
  });

  it("falls back to safe defaults for an empty UA", () => {
    expect(parseUserAgent("")).toEqual({
      browser: "unknown",
      device: "desktop",
      os: "unknown",
    });
    expect(parseUserAgent(undefined)).toEqual({
      browser: "unknown",
      device: "desktop",
      os: "unknown",
    });
  });
});

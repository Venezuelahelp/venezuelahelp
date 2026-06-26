import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  isPrivateIp,
  safeFetchText,
} from "@/connectors/ssrf";

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.10",
    "172.16.5.4",
    "172.31.255.255",
    "169.254.169.254", // AWS metadata
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
  ])("flags %s as private/reserved", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "203.0.0.5", "2606:4700:4700::1111"])(
    "allows public %s",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
});

describe("assertPublicHttpUrl", () => {
  it("accepts a normal https url", () => {
    const u = assertPublicHttpUrl("https://sismovenezuela.com/api/reportes");
    expect(u.hostname).toBe("sismovenezuela.com");
  });

  it.each([
    "ftp://example.com/x",
    "file:///etc/passwd",
    "gopher://example.com",
    "javascript:alert(1)",
  ])("rejects non-http(s) scheme %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:8080/",
    "http://10.0.0.5/internal",
    "http://[::1]/",
    "http://localhost/admin",
  ])("rejects url pointing to private/loopback host %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow();
  });

  it("rejects a malformed url", () => {
    expect(() => assertPublicHttpUrl("not a url")).toThrow();
  });
});

describe("safeFetchText", () => {
  it("rejects when the hostname resolves to a private ip (dns rebinding)", async () => {
    const resolveHost = vi.fn(async () => ["169.254.169.254"]);
    const fetchImpl = vi.fn();
    await expect(
      safeFetchText("https://evil.example.com/x", {
        resolveHost,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches text when the host resolves to a public ip", async () => {
    const resolveHost = vi.fn(async () => ["8.8.8.8"]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => "<html>hola</html>",
    }));
    const out = await safeFetchText("https://good.example.com/x", {
      resolveHost,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toBe("<html>hola</html>");
  });

  it("rejects a redirect to a private host", async () => {
    const resolveHost = vi
      .fn()
      .mockResolvedValueOnce(["8.8.8.8"]) // first host public
      .mockResolvedValueOnce(["169.254.169.254"]); // redirect target private
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 302,
      headers: new Map([["location", "http://169.254.169.254/"]]),
      text: async () => "",
    }));
    await expect(
      safeFetchText("https://good.example.com/x", {
        resolveHost,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
  });
});

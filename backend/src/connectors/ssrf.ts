import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for admin-provided source URLs.
 *
 * The AI connector fetches arbitrary URLs supplied through the admin backoffice.
 * Even though that surface is authenticated, we never trust the URL: a malicious
 * or mistaken value (e.g. `http://169.254.169.254/...`) could reach the AWS
 * instance metadata endpoint or internal network. We validate the URL structure,
 * block IP-literals in private/reserved ranges, resolve the hostname and reject
 * if any resolved address is private (DNS-rebinding defense), and re-validate
 * every redirect hop.
 */

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15000;

/** True for loopback, private, link-local, CGNAT, multicast and reserved IPs. */
export function isPrivateIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isPrivateIpv4(ip);
  if (fam === 6) return isPrivateIpv6(ip);
  return true; // not a literal IP → caller resolves DNS separately
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved (224.0.0.0/3)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded v4 address
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (lower.startsWith("fe80")) return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true; // multicast ff00::/8
  return false;
}

/** Parse and structurally validate a URL; throws on anything non-public. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`URL inválida: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Esquema no permitido: ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Host no permitido: localhost");
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error(`Host privado/reservado no permitido: ${host}`);
  }
  return url;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  resolveHost?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

async function defaultResolve(host: string): Promise<string[]> {
  if (isIP(host)) return [host];
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
}

async function assertResolvesPublic(
  url: URL,
  resolveHost: (host: string) => Promise<string[]>,
): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await resolveHost(host);
  if (addresses.length === 0) throw new Error(`No resuelve: ${host}`);
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new Error(`Host resuelve a IP privada (${addr}): ${host}`);
    }
  }
}

/**
 * Fetch text from an admin-provided URL with full SSRF protection: structural
 * validation, DNS-resolution checks against private ranges, manual redirect
 * following with re-validation at every hop, and a hard timeout.
 */
export async function safeFetchText(
  raw: string,
  opts: SafeFetchOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resolveHost = opts.resolveHost ?? defaultResolve;
  const fetchImpl = opts.fetchImpl ?? fetch;

  let current = assertPublicHttpUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvesPublic(current, resolveHost);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetchImpl(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "VenezuelaHelp/1.0",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirección sin Location");
      current = assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (!res.ok) {
      throw new Error(`GET ${current.toString()} ${res.status}`);
    }
    return res.text();
  }
  throw new Error("Demasiadas redirecciones");
}

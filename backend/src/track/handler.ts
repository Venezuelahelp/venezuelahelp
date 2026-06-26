import { VisitRepo } from "@/shared/repos/visitRepo";
import { parseUserAgent } from "@/track/userAgent";
import { logger } from "@/shared/logger";

// Endpoint público del beacon. Servido a través de CloudFront, que añade el
// header `CloudFront-Viewer-Country`. NUNCA guarda la IP. SIEMPRE responde 204
// (incluso ante body inválido o fallo de escritura) para no romper la carga del
// sitio público.

export interface TrackEvent {
  headers?: Record<string, string | undefined>;
  body?: string;
  requestContext?: { http?: { method?: string } };
}

export interface TrackDeps {
  visitRepo?: Pick<VisitRepo, "record">;
  now?: () => string;
}

function header(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function clip(s: unknown, max = 200): string {
  return typeof s === "string" ? s.slice(0, max) : "";
}

export async function handler(
  event: TrackEvent,
  deps: TrackDeps = {},
): Promise<{ statusCode: number; body: string }> {
  const noContent = { statusCode: 204, body: "" };
  const method = event.requestContext?.http?.method;
  if (method === "OPTIONS") return noContent;

  const visitRepo = deps.visitRepo ?? new VisitRepo();
  const now = deps.now?.() ?? new Date().toISOString();

  try {
    let payload: { path?: unknown; referrer?: unknown } = {};
    if (event.body) {
      try {
        payload = JSON.parse(event.body) as typeof payload;
      } catch {
        payload = {};
      }
    }
    const country = (header(event.headers, "cloudfront-viewer-country") ?? "ZZ")
      .slice(0, 2)
      .toUpperCase();
    const ua = parseUserAgent(header(event.headers, "user-agent"));

    await visitRepo.record({
      country,
      browser: ua.browser,
      device: ua.device,
      os: ua.os,
      path: clip(payload.path),
      referrer: clip(payload.referrer),
      now,
    });
  } catch (err) {
    // Nunca propagamos el error al cliente: el beacon no debe romper el sitio.
    logger.warn("track beacon: fallo al registrar la visita", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return noContent;
}

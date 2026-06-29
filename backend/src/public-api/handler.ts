import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiRequestRepo } from "@/shared/repos/apiRequestRepo";
import { RateLimitRepo } from "@/shared/repos/rateLimitRepo";
import type { ApiAccessRequest } from "@/shared/types";
import { logger } from "@/shared/logger";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST,OPTIONS",
} as const;

// Anti-spam: pocas solicitudes por IP por ventana.
const IP_LIMIT = 5;
const IP_WINDOW_SEC = 3600;

const bodySchema = z.object({
  nombre: z.string().min(1).max(120),
  email: z.string().email().max(200),
  organizacion: z.string().max(120).optional(),
  motivo: z.string().min(1).max(1000),
  descripcion: z.string().max(2000).optional(),
  aceptaTerminos: z.literal(true),
});

export interface IntakeEvent {
  requestContext: { http: { method: string; sourceIp?: string } };
  body?: string;
}

export interface IntakeDeps {
  apiRequestRepo?: Pick<ApiRequestRepo, "put">;
  rateLimit?: Pick<RateLimitRepo, "hit">;
  now?: () => string;
  genId?: () => string;
}

interface Result {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function json(status: number, body: unknown): Result {
  return {
    statusCode: status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(
  event: IntakeEvent,
  deps: IntakeDeps = {},
): Promise<Result> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS }, body: "" };
  }

  const rateLimit = deps.rateLimit ?? new RateLimitRepo();
  const ip = event.requestContext.http.sourceIp ?? "unknown";
  const { allowed } = await rateLimit.hit(`ip:${ip}`, {
    limit: IP_LIMIT,
    windowSec: IP_WINDOW_SEC,
  });
  if (!allowed) {
    return json(429, { error: "demasiadas solicitudes, intenta más tarde" });
  }

  let parsedBody: unknown;
  try {
    parsedBody = event.body ? JSON.parse(event.body) : undefined;
  } catch {
    return json(400, { error: "json inválido" });
  }

  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return json(400, { error: "datos inválidos", issues: parsed.error.issues });
  }

  const apiRequestRepo = deps.apiRequestRepo ?? new ApiRequestRepo();
  const now = deps.now ?? (() => new Date().toISOString());
  const genId = deps.genId ?? randomUUID;

  const request: ApiAccessRequest = {
    id: genId(),
    nombre: parsed.data.nombre,
    email: parsed.data.email,
    organizacion: parsed.data.organizacion,
    motivo: parsed.data.motivo,
    descripcion: parsed.data.descripcion,
    status: "pendiente",
    createdAt: now(),
  };

  try {
    await apiRequestRepo.put(request);
  } catch (err) {
    logger.error("intake: no se pudo guardar la solicitud", { err });
    return json(500, { error: "error interno" });
  }

  return json(202, { received: true });
}

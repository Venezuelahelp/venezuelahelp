import { z } from "zod";
import type { ConfigRepo } from "@/shared/repos/configRepo";
import type { SourceRepo } from "@/shared/repos/sourceRepo";
import type { ItemRepo } from "@/shared/repos/itemRepo";
import type { VisitRepo } from "@/shared/repos/visitRepo";
import type { TgUserRepo } from "@/shared/repos/tgUserRepo";
import type { ApiRequestRepo } from "@/shared/repos/apiRequestRepo";
import type { ApiKeyRepo } from "@/shared/repos/apiKeyRepo";
import type { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { assertPublicHttpUrl } from "@/connectors/ssrf";
import { runRestSource } from "@/connectors/restEngine";
import { fetchJson } from "@/connectors/http";
import {
  CATEGORIES,
  type EndpointStat,
  type NormalizedItem,
} from "@/shared/types";
import type { RestConfig } from "@/connectors/restConfig";

export interface RouteDeps {
  configRepo: Pick<ConfigRepo, "get" | "put">;
  sourceRepo: Pick<SourceRepo, "list" | "get" | "put" | "delete">;
  itemRepo: Pick<ItemRepo, "listByCategory" | "countByCategory">;
  invokeScraper: () => Promise<void>;
  visitRepo: Pick<VisitRepo, "analytics">;
  tgUserRepo: Pick<TgUserRepo, "list" | "setBlocked">;
  apiRequestRepo: Pick<ApiRequestRepo, "list" | "get" | "setStatus">;
  apiKeyRepo: Pick<ApiKeyRepo, "list" | "create" | "revoke">;
  // Visor de Q&A del bot: Query por PK=QA#<chatId>, sin Scan.
  qaLogRepo: Pick<QaLogRepo, "listByChat">;
  // Actor (email Cognito) para el audit de aprobación/revocación, y reloj
  // inyectable para timestamps determinísticos en tests.
  actor: string;
  now: () => string;
  // Dry-run de una RestConfig (probar mapeo antes de guardar). Inyectable para
  // tests; por defecto corre el motor rest real contra los endpoints.
  probeRest?: (
    rest: RestConfig,
  ) => Promise<{ items: NormalizedItem[]; endpointStats: EndpointStat[] }>;
}

export interface RouteResult {
  status: number;
  body: unknown;
}

const configSchema = z.object({
  scrapeRateMin: z.number().int().min(5).max(1440),
  bedrockModelId: z.string().min(1),
  systemPrompt: z.string().min(1),
  botTriggerMode: z.enum(["mention", "command", "all"]),
});

const newSourceSchema = z.object({
  nombre: z.string().min(1).max(80),
  // Además de ser una URL válida, rechaza esquemas no http(s) y hosts
  // privados/loopback/metadata (SSRF) ya en el alta de la fuente.
  url: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          assertPublicHttpUrl(u);
          return true;
        } catch {
          return false;
        }
      },
      { message: "URL no permitida (host privado o esquema inválido)" },
    ),
  extractHint: z.string().max(500).optional(),
});

// URL pública (http(s), no privada) reutilizable en endpoints rest.
const publicUrl = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        assertPublicHttpUrl(u);
        return true;
      } catch {
        return false;
      }
    },
    { message: "URL no permitida (host privado o esquema inválido)" },
  );

const fieldMapSchema = z.object({
  externalId: z.string().min(1),
  externalIdFrom: z.array(z.string().min(1)).max(6).optional(),
  titulo: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  tituloDefault: z.string().max(120).optional(),
  texto: z.array(z.string()).max(10).optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  imageUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceUrlTemplate: z.string().optional(),
  status: z.string().optional(),
});

const restEndpointSchema = z.object({
  label: z.string().min(1).max(40),
  url: publicUrl,
  category: z.enum(CATEGORIES),
  itemsPath: z.string().max(80).optional(),
  shape: z.enum(["array", "geojson"]).optional(),
  fieldMap: fieldMapSchema,
  headers: z.record(z.string()).optional(),
  skipRows: z.number().int().min(0).max(100).optional(),
  paginate: z
    .object({
      pageSize: z.number().int().min(1).max(1000),
      maxItems: z.number().int().min(1).optional(),
    })
    .optional(),
});

const restConfigSchema = z.object({
  base: publicUrl,
  endpoints: z.array(restEndpointSchema).min(1).max(10),
});

const newRestSourceSchema = z.object({
  tipo: z.literal("rest"),
  nombre: z.string().min(1).max(80),
  url: publicUrl,
  rest: restConfigSchema,
});

const patchSourceConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    rest: restConfigSchema.optional(),
  })
  .refine((b) => b.enabled !== undefined || b.rest !== undefined, {
    message: "se requiere 'enabled' o 'rest'",
  });

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fuente"
  );
}

// Parsea ?limit= con default y techo (los endpoints de lectura del admin
// nunca devuelven páginas sin acotar).
function parseLimit(raw: string | undefined, def: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}

export async function route(
  method: string,
  path: string,
  body: unknown,
  deps: RouteDeps,
  query: Record<string, string | undefined> = {},
): Promise<RouteResult> {
  const segments = path.split("/");
  // segments[0] is "" (before leading slash)

  // GET /config
  if (method === "GET" && path === "/config") {
    const config = await deps.configRepo.get();
    return { status: 200, body: config };
  }

  // PUT /config
  if (method === "PUT" && path === "/config") {
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: "invalid config", issues: parsed.error.issues },
      };
    }
    // Preservamos los campos no editables por este endpoint (p.ej. `enrichment`),
    // que se ajustan por separado y no deben perderse al guardar la config básica.
    const current = await deps.configRepo.get();
    const merged = { ...current, ...parsed.data };
    await deps.configRepo.put(merged);
    return { status: 200, body: merged };
  }

  // GET /sources
  if (method === "GET" && path === "/sources") {
    const sources = await deps.sourceRepo.list();
    return { status: 200, body: sources };
  }

  // PATCH /sources/{id}
  if (
    method === "PATCH" &&
    segments.length === 3 &&
    segments[1] === "sources" &&
    segments[2] !== ""
  ) {
    const id = segments[2];
    const parsed = patchSourceConfigSchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: "invalid body", issues: parsed.error.issues },
      };
    }
    const src = await deps.sourceRepo.get(id);
    if (!src) {
      return { status: 404, body: { error: "source not found" } };
    }
    const updated = { ...src };
    if (parsed.data.enabled !== undefined)
      updated.enabled = parsed.data.enabled;
    if (parsed.data.rest !== undefined) {
      updated.rest = parsed.data.rest;
      updated.connector = "rest";
    }
    await deps.sourceRepo.put(updated);
    return { status: 200, body: updated };
  }

  // POST /sources/probe — dry-run de una RestConfig (probar mapeo sin guardar)
  if (method === "POST" && path === "/sources/probe") {
    const parsed = restConfigSchema.safeParse(
      (body as { rest?: unknown } | undefined)?.rest,
    );
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: "invalid rest config", issues: parsed.error.issues },
      };
    }
    const runProbe =
      deps.probeRest ??
      ((rest: RestConfig) => runRestSource("__probe__", rest, { fetchJson }));
    const { items, endpointStats } = await runProbe(parsed.data);
    // Muestra acotada para que el admin valide el mapeo sin traer todo.
    return {
      status: 200,
      body: { endpointStats, sample: items.slice(0, 15) },
    };
  }

  // POST /scrape
  if (method === "POST" && path === "/scrape") {
    await deps.invokeScraper();
    return { status: 202, body: { started: true } };
  }

  // GET /analytics — analítica agregada de visitantes web
  if (method === "GET" && path === "/analytics") {
    const data = await deps.visitRepo.analytics(new Date().toISOString());
    return { status: 200, body: data };
  }

  // GET /tg-users — directorio de usuarios del bot de Telegram
  if (method === "GET" && path === "/tg-users") {
    const users = await deps.tgUserRepo.list();
    return {
      status: 200,
      body: users.map((u) => ({
        chatId: u.chatId,
        username: u.username ?? undefined,
        nombre: [u.firstName, u.lastName]
          .filter(Boolean)
          .join(" ")
          .slice(0, 80),
        languageCode: u.languageCode ?? undefined,
        firstSeenAt: u.firstSeenAt,
        lastSeenAt: u.lastSeenAt,
        msgCount: u.msgCount,
        strikes: u.strikes ?? 0,
        blocked: u.blocked ?? false,
        blockedAt: u.blockedAt ?? undefined,
        blockReason: u.blockReason ?? undefined,
      })),
    };
  }

  // POST /tg-users/{chatId}/block  y  /unblock — lista negra del bot
  const blockM = path.match(/^\/tg-users\/([^/]+)\/(block|unblock)$/);
  if (method === "POST" && blockM) {
    const chatId = Number(decodeURIComponent(blockM[1]));
    const block = blockM[2] === "block";
    if (!Number.isFinite(chatId)) {
      return { status: 400, body: { error: "chatId inválido" } };
    }
    await deps.tgUserRepo.setBlocked(
      chatId,
      block,
      deps.now(),
      block ? "Bloqueado desde el admin" : undefined,
    );
    return { status: 200, body: { chatId, blocked: block } };
  }

  // GET /qa-logs/{chatId} — últimas interacciones Q&A de un chat del bot
  const qaLogsM = path.match(/^\/qa-logs\/([^/]+)$/);
  if (method === "GET" && qaLogsM) {
    const chatId = decodeURIComponent(qaLogsM[1]);
    const limit = parseLimit(query.limit, 50, 200);
    const logs = await deps.qaLogRepo.listByChat(chatId, limit);
    return { status: 200, body: logs };
  }

  // GET /stats
  if (method === "GET" && path === "/stats") {
    const countEntries = await Promise.all(
      CATEGORIES.map(async (cat) => {
        const n = await deps.itemRepo.countByCategory(cat);
        return [cat, n] as const;
      }),
    );
    const counts = Object.fromEntries(countEntries) as Record<
      (typeof CATEGORIES)[number],
      number
    >;
    const allSources = await deps.sourceRepo.list();
    const sources = allSources.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      enabled: s.enabled,
      connector: s.connector,
      lastRun: s.lastRun,
      lastStatus: s.lastStatus,
      status: s.status,
      lastFetched: s.lastFetched,
      endpointStats: s.endpointStats,
    }));
    return { status: 200, body: { counts, sources } };
  }

  // POST /sources — tipo "ai" (default, pega una URL) o "rest" (API JSON
  // declarativa: base + endpoints + mapeo de campos).
  if (method === "POST" && path === "/sources") {
    if ((body as { tipo?: unknown } | undefined)?.tipo === "rest") {
      const parsed = newRestSourceSchema.safeParse(body);
      if (!parsed.success)
        return {
          status: 400,
          body: { error: "invalid", issues: parsed.error.issues },
        };
      let id = slugify(parsed.data.nombre);
      for (let n = 2; await deps.sourceRepo.get(id); n++)
        id = `${slugify(parsed.data.nombre)}-${n}`;
      const source = {
        id,
        nombre: parsed.data.nombre,
        url: parsed.data.url,
        connector: "rest" as const,
        rest: parsed.data.rest,
        enabled: true,
      };
      await deps.sourceRepo.put(source);
      return { status: 201, body: source };
    }
    const parsed = newSourceSchema.safeParse(body);
    if (!parsed.success)
      return {
        status: 400,
        body: { error: "invalid", issues: parsed.error.issues },
      };
    let id = slugify(parsed.data.nombre);
    for (let n = 2; await deps.sourceRepo.get(id); n++)
      id = `${slugify(parsed.data.nombre)}-${n}`;
    const source = {
      id,
      nombre: parsed.data.nombre,
      url: parsed.data.url,
      connector: "ai" as const,
      enabled: true,
      extractHint: parsed.data.extractHint,
    };
    await deps.sourceRepo.put(source);
    return { status: 201, body: source };
  }

  // DELETE /sources/{id}
  const del = path.match(/^\/sources\/([^/]+)$/);
  if (method === "DELETE" && del) {
    await deps.sourceRepo.delete(decodeURIComponent(del[1]));
    return { status: 200, body: { deleted: decodeURIComponent(del[1]) } };
  }

  // ── Programa de API para terceros ──────────────────────────────────────────

  // GET /api-requests — solicitudes de acceso al API
  if (method === "GET" && path === "/api-requests") {
    const requests = await deps.apiRequestRepo.list();
    return { status: 200, body: requests };
  }

  // POST /api-requests/{id}/approve — aprueba, emite key y la devuelve UNA vez
  const approve = path.match(/^\/api-requests\/([^/]+)\/approve$/);
  if (method === "POST" && approve) {
    const id = decodeURIComponent(approve[1]);
    const req = await deps.apiRequestRepo.get(id);
    if (!req) return { status: 404, body: { error: "request not found" } };
    if (req.status !== "pendiente") {
      return { status: 409, body: { error: "la solicitud no está pendiente" } };
    }
    const now = deps.now();
    const { rawKey, apiKey } = await deps.apiKeyRepo.create({
      consumerName: req.nombre,
      email: req.email,
      requestId: id,
      createdAt: now,
    });
    await deps.apiRequestRepo.setStatus(id, {
      status: "aprobada",
      reviewedBy: deps.actor,
      reviewedAt: now,
      apiKeyId: apiKey.keyId,
    });
    // rawKey viaja UNA vez en la respuesta; el admin la muestra y nunca se vuelve
    // a poder recuperar (en DB solo queda el hash).
    return {
      status: 200,
      body: { request: { ...req, status: "aprobada" }, apiKey, rawKey },
    };
  }

  // POST /api-requests/{id}/reject
  const reject = path.match(/^\/api-requests\/([^/]+)\/reject$/);
  if (method === "POST" && reject) {
    const id = decodeURIComponent(reject[1]);
    const req = await deps.apiRequestRepo.get(id);
    if (!req) return { status: 404, body: { error: "request not found" } };
    await deps.apiRequestRepo.setStatus(id, {
      status: "rechazada",
      reviewedBy: deps.actor,
      reviewedAt: deps.now(),
    });
    return { status: 200, body: { request: { ...req, status: "rechazada" } } };
  }

  // GET /api-keys — keys emitidas
  if (method === "GET" && path === "/api-keys") {
    const keys = await deps.apiKeyRepo.list();
    return { status: 200, body: keys };
  }

  // POST /api-keys/{id}/revoke
  const revoke = path.match(/^\/api-keys\/([^/]+)\/revoke$/);
  if (method === "POST" && revoke) {
    const keyId = decodeURIComponent(revoke[1]);
    const ok = await deps.apiKeyRepo.revoke(keyId, deps.now());
    if (!ok) return { status: 404, body: { error: "key not found" } };
    return { status: 200, body: { revoked: true } };
  }

  return { status: 404, body: { error: "not found" } };
}

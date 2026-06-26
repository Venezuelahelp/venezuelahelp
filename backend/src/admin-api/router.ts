import { z } from "zod";
import type { ConfigRepo } from "@/shared/repos/configRepo";
import type { SourceRepo } from "@/shared/repos/sourceRepo";
import type { ItemRepo } from "@/shared/repos/itemRepo";
import type { VisitRepo } from "@/shared/repos/visitRepo";
import type { TgUserRepo } from "@/shared/repos/tgUserRepo";
import { assertPublicHttpUrl } from "@/connectors/ssrf";
import { CATEGORIES } from "@/shared/types";

export interface RouteDeps {
  configRepo: Pick<ConfigRepo, "get" | "put">;
  sourceRepo: Pick<SourceRepo, "list" | "get" | "put" | "delete">;
  itemRepo: Pick<ItemRepo, "listByCategory">;
  invokeScraper: () => Promise<void>;
  visitRepo: Pick<VisitRepo, "analytics">;
  tgUserRepo: Pick<TgUserRepo, "list">;
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

const patchSourceSchema = z.object({
  enabled: z.boolean(),
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

export async function route(
  method: string,
  path: string,
  body: unknown,
  deps: RouteDeps,
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
    await deps.configRepo.put(parsed.data);
    return { status: 200, body: parsed.data };
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
    const parsed = patchSourceSchema.safeParse(body);
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
    const updated = { ...src, enabled: parsed.data.enabled };
    await deps.sourceRepo.put(updated);
    return { status: 200, body: updated };
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
      })),
    };
  }

  // GET /stats
  if (method === "GET" && path === "/stats") {
    const countEntries = await Promise.all(
      CATEGORIES.map(async (cat) => {
        const items = await deps.itemRepo.listByCategory(cat);
        return [cat, items.length] as const;
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
      lastRun: s.lastRun,
      lastStatus: s.lastStatus,
    }));
    return { status: 200, body: { counts, sources } };
  }

  // POST /sources
  if (method === "POST" && path === "/sources") {
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

  return { status: 404, body: { error: "not found" } };
}

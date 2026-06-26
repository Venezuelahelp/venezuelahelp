import { z } from "zod";
import type { ConfigRepo } from "@/shared/repos/configRepo";
import type { SourceRepo } from "@/shared/repos/sourceRepo";
import type { ItemRepo } from "@/shared/repos/itemRepo";
import { CATEGORIES } from "@/shared/types";

export interface RouteDeps {
  configRepo: Pick<ConfigRepo, "get" | "put">;
  sourceRepo: Pick<SourceRepo, "list" | "get" | "put">;
  itemRepo: Pick<ItemRepo, "listByCategory">;
  invokeScraper: () => Promise<void>;
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

  return { status: 404, body: { error: "not found" } };
}

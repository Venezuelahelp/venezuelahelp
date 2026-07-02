import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { route as defaultRoute } from "@/admin-api/router";
import type { route as RouteType } from "@/admin-api/router";
import { ConfigRepo } from "@/shared/repos/configRepo";
import { SourceRepo } from "@/shared/repos/sourceRepo";
import { ItemRepo } from "@/shared/repos/itemRepo";
import { VisitRepo } from "@/shared/repos/visitRepo";
import { TgUserRepo } from "@/shared/repos/tgUserRepo";
import { ApiRequestRepo } from "@/shared/repos/apiRequestRepo";
import { ApiKeyRepo } from "@/shared/repos/apiKeyRepo";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
import { getSnapshotUpdatedAt } from "@/admin-api/snapshotHead";
import { loadSnapshot } from "@/data-api/snapshot";
import { queryItems } from "@/data-api/query";
import { logger } from "@/shared/logger";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,PUT,PATCH,POST,OPTIONS",
} as const;

export interface HandlerEvent {
  requestContext: {
    http: { method: string };
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  rawPath: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function actorFrom(event: HandlerEvent): string {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  return (claims?.email as string) ?? (claims?.sub as string) ?? "desconocido";
}

export interface HandlerDeps {
  route?: typeof RouteType;
  lambda?: Pick<LambdaClient, "send">;
}

const moduleLambda = new LambdaClient({});

export async function handler(
  event: HandlerEvent,
  deps: HandlerDeps = {},
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  const method = event.requestContext.http.method;

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS }, body: "" };
  }

  const routeFn = deps.route ?? defaultRoute;
  const lambdaClient = deps.lambda ?? moduleLambda;

  const parsedBody = event.body
    ? (JSON.parse(event.body) as unknown)
    : undefined;

  const routeDeps = {
    configRepo: new ConfigRepo(),
    sourceRepo: new SourceRepo(),
    itemRepo: new ItemRepo(),
    visitRepo: new VisitRepo(),
    tgUserRepo: new TgUserRepo(),
    apiRequestRepo: new ApiRequestRepo(),
    apiKeyRepo: new ApiKeyRepo(),
    qaLogRepo: new QaLogRepo(),
    scrapeRunRepo: new ScrapeRunRepo(),
    // Nunca lanza: HeadObject con try/catch dentro del módulo.
    snapshotUpdatedAt: () => getSnapshotUpdatedAt(),
    // Mismo engine y misma URL pública que el data-api /v1 (SNAPSHOT_URL).
    searchSnapshot: async (params: {
      q?: string;
      category?: string;
      limit?: number;
    }) => queryItems(await loadSnapshot(), params),
    actor: actorFrom(event),
    now: () => new Date().toISOString(),
    invokeScraper: () =>
      lambdaClient
        .send(
          new InvokeCommand({
            FunctionName: process.env.SCRAPER_FN_NAME,
            InvocationType: "Event",
          }),
        )
        .then(() => {}),
  };

  try {
    const result = await routeFn(
      method,
      event.rawPath,
      parsedBody,
      routeDeps,
      event.queryStringParameters ?? {},
    );
    // Audit trail: registra cada mutación admin (quién, qué, resultado) en
    // CloudWatch. Las lecturas (GET) no se auditan.
    if (MUTATING.has(method)) {
      logger.info("admin audit", {
        actor: actorFrom(event),
        method,
        path: event.rawPath,
        status: result.status,
      });
    }
    return {
      statusCode: result.status,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(result.body),
    };
  } catch (err) {
    logger.error("Unhandled error in admin-api handler", { err });
    return {
      statusCode: 500,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({ error: "internal error" }),
    };
  }
}

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { route as defaultRoute } from "@/admin-api/router";
import type { route as RouteType } from "@/admin-api/router";
import { ConfigRepo } from "@/shared/repos/configRepo";
import { SourceRepo } from "@/shared/repos/sourceRepo";
import { ItemRepo } from "@/shared/repos/itemRepo";
import { logger } from "@/shared/logger";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,PUT,PATCH,POST,OPTIONS",
} as const;

export interface HandlerEvent {
  requestContext: { http: { method: string } };
  rawPath: string;
  pathParameters?: Record<string, string>;
  body?: string;
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
    const result = await routeFn(method, event.rawPath, parsedBody, routeDeps);
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

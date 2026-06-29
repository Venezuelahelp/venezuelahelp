import { ApiKeyRepo, hashKey } from "@/shared/repos/apiKeyRepo";
import { RateLimitRepo } from "@/shared/repos/rateLimitRepo";
import type { ApiKey } from "@/shared/types";
import { logger } from "@/shared/logger";

// Límite por key (ventana fija). Backstop adicional al throttle de stage.
const PER_KEY_LIMIT = 60;
const PER_KEY_WINDOW_SEC = 60;

export interface AuthorizerEvent {
  headers?: Record<string, string | undefined>;
}

export interface AuthorizerDeps {
  apiKeyRepo?: Pick<ApiKeyRepo, "getByHash">;
  rateLimit?: Pick<RateLimitRepo, "hit">;
}

export interface AuthorizerResult {
  isAuthorized: boolean;
  context?: Record<string, string>;
}

const DENY: AuthorizerResult = { isAuthorized: false };

export async function authorizer(
  event: AuthorizerEvent,
  deps: AuthorizerDeps = {},
): Promise<AuthorizerResult> {
  // Fail-closed: ante cualquier duda o error, se deniega (a diferencia del bot,
  // que en rate-limit falla abierto). Aquí proteger el acceso pesa más.
  try {
    const rawKey = event.headers?.["x-api-key"];
    if (!rawKey) return DENY;

    const apiKeyRepo = deps.apiKeyRepo ?? new ApiKeyRepo();
    const key: ApiKey | null = await apiKeyRepo.getByHash(hashKey(rawKey));
    if (!key || key.status !== "active") return DENY;

    const rateLimit = deps.rateLimit ?? new RateLimitRepo();
    const { allowed } = await rateLimit.hit(`apikey:${key.keyId}`, {
      limit: PER_KEY_LIMIT,
      windowSec: PER_KEY_WINDOW_SEC,
    });
    if (!allowed) return DENY;

    return {
      isAuthorized: true,
      context: { keyId: key.keyId, consumerName: key.consumerName },
    };
  } catch (err) {
    logger.error("data-api authorizer error (deny)", { err });
    return DENY;
  }
}

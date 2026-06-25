import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const NAME = "/venezuelahelp/telegram-token";
let cached: string | null = null;

const SECRET_NAME = "/venezuelahelp/telegram-webhook-secret";
let cachedSecret: string | null = null;

interface Deps {
  ssm: Pick<SSMClient, "send">;
}

export async function getTelegramToken(deps?: Partial<Deps>): Promise<string> {
  if (cached) return cached;
  const client = (deps?.ssm as Deps["ssm"]) ?? ssm;
  const res = await client.send(
    new GetParameterCommand({ Name: NAME, WithDecryption: true }),
  );
  cached = res.Parameter?.Value ?? "";
  return cached;
}

export async function getWebhookSecret(deps?: Partial<Deps>): Promise<string> {
  if (cachedSecret !== null) return cachedSecret;
  const client = (deps?.ssm as Deps["ssm"]) ?? ssm;
  try {
    const res = await client.send(
      new GetParameterCommand({ Name: SECRET_NAME, WithDecryption: true }),
    );
    cachedSecret = res.Parameter?.Value ?? "";
  } catch {
    cachedSecret = ""; // sin secreto configurado => verificación deshabilitada
  }
  return cachedSecret;
}

export function __resetTokenCache() {
  cached = null;
  cachedSecret = null;
}

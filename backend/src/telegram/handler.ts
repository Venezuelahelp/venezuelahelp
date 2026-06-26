import { ConfigRepo } from "@/shared/repos/configRepo";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { logger } from "@/shared/logger";
import { getTelegramToken, getWebhookSecret } from "@/telegram/secret";
import { getMe, sendMessage as realSend } from "@/telegram/telegramApi";
import { loadSnapshot as realLoad } from "@/telegram/snapshot";
import { askBedrock as realAsk } from "@/telegram/bedrock";
import { retrieve } from "@/telegram/retrieval";
import { buildUserText } from "@/telegram/prompt";
import {
  shouldRespond,
  extractQuestion,
  isStartCommand,
} from "@/telegram/trigger";
import type { TgUpdate } from "@/telegram/types";

const FALLBACK =
  "Disculpa, estoy con mucha demanda ahora mismo. Intenta de nuevo en un momento.";
const NO_DATA =
  "No tengo ese dato en la información del terremoto que tengo disponible.";
const WELCOME = [
  "👋 ¡Hola! Soy el asistente de VenezuelaHelp.",
  "",
  "Reúno información pública sobre el terremoto de Venezuela (25 de junio de 2026) y respondo tus preguntas sobre reportes, personas desaparecidas, centros de acopio, estado de edificios y solicitudes de ayuda.",
  "",
  "Solo escríbeme tu pregunta en lenguaje natural. Por ejemplo:",
  "• ¿Dónde hay centros de acopio en Chacao?",
  "• ¿Cuántas personas desaparecidas hay reportadas?",
  "• ¿Qué edificios resultaron afectados en Caracas?",
  "• ¿Cómo puedo solicitar ayuda?",
  "",
  "Te respondo con la información disponible y cito la fuente. Si no tengo el dato, te lo diré.",
].join("\n");

let botUsernameCache: string | null = null;

interface Deps {
  getToken: typeof getTelegramToken;
  getWebhookSecret: typeof getWebhookSecret;
  getBotUsername: (token: string) => Promise<string>;
  configRepo: Pick<ConfigRepo, "get">;
  qaLogRepo: Pick<QaLogRepo, "append">;
  loadSnapshot: typeof realLoad;
  askBedrock: typeof realAsk;
  sendMessage: typeof realSend;
}

async function defaultBotUsername(token: string): Promise<string> {
  if (botUsernameCache) return botUsernameCache;
  botUsernameCache = (await getMe(token)).username;
  return botUsernameCache;
}

export async function handler(
  event: { body?: string; headers?: Record<string, string | undefined> },
  deps?: Partial<Deps>,
): Promise<{ statusCode: number; body: string }> {
  const d: Deps = {
    getToken: deps?.getToken ?? getTelegramToken,
    getWebhookSecret: deps?.getWebhookSecret ?? getWebhookSecret,
    getBotUsername: deps?.getBotUsername ?? defaultBotUsername,
    configRepo: deps?.configRepo ?? new ConfigRepo(),
    qaLogRepo: deps?.qaLogRepo ?? new QaLogRepo(),
    loadSnapshot: deps?.loadSnapshot ?? realLoad,
    askBedrock: deps?.askBedrock ?? realAsk,
    sendMessage: deps?.sendMessage ?? realSend,
  };

  let chatId: number | undefined;
  let token: string | undefined;
  try {
    const update = JSON.parse(event.body ?? "{}") as TgUpdate;
    const msg = update.message;
    if (!msg || !msg.text) return ok();
    chatId = msg.chat.id;

    const expectedSecret = await d.getWebhookSecret();
    if (expectedSecret) {
      const got = event.headers?.["x-telegram-bot-api-secret-token"];
      if (got !== expectedSecret) {
        logger.warn("telegram webhook secret mismatch");
        return ok();
      }
    }

    if (msg.from?.is_bot) return ok();

    token = await d.getToken();
    const botUsername = await d.getBotUsername(token);
    const config = await d.configRepo.get();
    if (!shouldRespond(msg, botUsername, config.botTriggerMode)) return ok();

    // La primera interacción (deep link / botón "Iniciar") o /start no es una
    // pregunta: damos la bienvenida y explicamos cómo funciona el bot.
    if (isStartCommand(msg)) {
      await d.sendMessage(token, chatId, WELCOME);
      return ok();
    }

    const question = extractQuestion(msg, botUsername);
    const snap = await d.loadSnapshot();
    const items = retrieve(question, snap);

    if (items.length === 0) {
      await d.sendMessage(token, chatId, NO_DATA);
      await logQa(
        d,
        chatId,
        question,
        NO_DATA,
        [],
        config.bedrockModelId,
        0,
        0,
      );
      return ok();
    }

    const userText = buildUserText(question, items);
    const ans = await d.askBedrock(
      config.bedrockModelId,
      config.systemPrompt,
      userText,
    );
    const reply = ans.text.trim() || NO_DATA;
    await d.sendMessage(token, chatId, reply);
    await logQa(
      d,
      chatId,
      question,
      reply,
      items.map((i) => `${i.category}/${i.sourceId}#${i.externalId}`),
      config.bedrockModelId,
      ans.tokensIn,
      ans.tokensOut,
    );
    return ok();
  } catch (err) {
    logger.error("telegram handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (token && chatId !== undefined) {
      try {
        await d.sendMessage(token, chatId, FALLBACK);
      } catch (e) {
        logger.error("fallback send failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return ok();
  }
}

async function logQa(
  d: Deps,
  chatId: number,
  pregunta: string,
  respuesta: string,
  itemsUsados: string[],
  modelo: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await d.qaLogRepo.append({
    chatId: String(chatId),
    ts: new Date().toISOString(),
    pregunta,
    respuesta,
    itemsUsados,
    tokensIn,
    tokensOut,
    modelo,
    costoEstimado: 0,
    flagged: false,
  });
}

function ok() {
  return { statusCode: 200, body: "ok" };
}

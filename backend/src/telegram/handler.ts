import { ConfigRepo } from "@/shared/repos/configRepo";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { RateLimitRepo } from "@/shared/repos/rateLimitRepo";
import { TgUserRepo } from "@/shared/repos/tgUserRepo";
import { logger } from "@/shared/logger";
import { getTelegramToken, getWebhookSecret } from "@/telegram/secret";
import {
  getMe,
  sendMessage as realSend,
  answerCallbackQuery as realAnswer,
} from "@/telegram/telegramApi";
import { loadSnapshot as realLoad } from "@/telegram/snapshot";
import {
  askBedrock as realAsk,
  askBedrockToolRouter as realRoute,
} from "@/telegram/bedrock";
import { retrieve, countAnswer, isHelpRequest } from "@/telegram/retrieval";
import { answerWithTools } from "@/telegram/agent";
import { buildUserText } from "@/telegram/prompt";
import {
  shouldRespond,
  extractQuestion,
  isStartCommand,
  isMenuCommand,
} from "@/telegram/trigger";
import {
  categoryScreen,
  homeScreen,
  locationPrompt,
  navScreen,
  LOCATION_ACTIONS,
  SKIP_LOCATION_TEXT,
} from "@/telegram/menu";
import { MenuStateRepo, type MenuState } from "@/telegram/menuState";
import type { LatLng } from "@/telegram/geo";
import type { TgCallbackQuery, TgMessage, TgUpdate } from "@/telegram/types";

const FALLBACK =
  "Disculpa, estoy con mucha demanda ahora mismo. Intenta de nuevo en un momento.";
const NO_DATA =
  "No tengo ese dato en la información del terremoto que tengo disponible.";
const RATE_LIMITED =
  "Estás enviando preguntas muy rápido. Espera un momento y vuelve a intentar. 🙏";
const HELP_GUIDE = [
  "Para pedir ayuda 🆘",
  "",
  "• Cuéntame tu necesidad concreta (por ejemplo: «necesito agua en Petare» o «busco un refugio en La Guaira») y te muestro lo que haya registrado.",
  "• O abre el menú con /menu y entra a 🚨 NECESITO AYUDA (emergencias, refugios y víveres).",
  "",
  "⚠️ Si hay riesgo de vida, llama a emergencias (171).",
].join("\n");

const FRESH_MS = 60 * 60 * 1000;

let botUsernameCache: string | null = null;

interface Deps {
  getToken: typeof getTelegramToken;
  getWebhookSecret: typeof getWebhookSecret;
  getBotUsername: (token: string) => Promise<string>;
  configRepo: Pick<ConfigRepo, "get">;
  qaLogRepo: Pick<QaLogRepo, "append">;
  rateLimit: Pick<RateLimitRepo, "hit">;
  tgUserRepo: Pick<TgUserRepo, "upsert">;
  menuState: Pick<
    MenuStateRepo,
    "get" | "setPending" | "setLocation" | "clearPending"
  >;
  loadSnapshot: typeof realLoad;
  askBedrock: typeof realAsk;
  routeTools: typeof realRoute;
  sendMessage: typeof realSend;
  answerCallbackQuery: typeof realAnswer;
}

async function defaultBotUsername(token: string): Promise<string> {
  if (botUsernameCache) return botUsernameCache;
  botUsernameCache = (await getMe(token)).username;
  return botUsernameCache;
}

function freshLoc(state: MenuState, now: number): LatLng | undefined {
  if (state.lastLat == null || state.lastLng == null || !state.lastLocationAt)
    return undefined;
  if (now - Date.parse(state.lastLocationAt) > FRESH_MS) return undefined;
  return { lat: state.lastLat, lng: state.lastLng };
}

// Lectura de estado tolerante a fallos de DynamoDB: degradar, no romper.
async function safeGetState(d: Deps, chatId: number): Promise<MenuState> {
  try {
    return await d.menuState.get(chatId);
  } catch (e) {
    logger.warn("no se pudo leer el estado del menú", {
      chatId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {};
  }
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
    rateLimit: deps?.rateLimit ?? new RateLimitRepo(),
    tgUserRepo: deps?.tgUserRepo ?? new TgUserRepo(),
    menuState: deps?.menuState ?? new MenuStateRepo(),
    loadSnapshot: deps?.loadSnapshot ?? realLoad,
    askBedrock: deps?.askBedrock ?? realAsk,
    routeTools: deps?.routeTools ?? realRoute,
    sendMessage: deps?.sendMessage ?? realSend,
    answerCallbackQuery: deps?.answerCallbackQuery ?? realAnswer,
  };

  let chatId: number | undefined;
  let token: string | undefined;
  try {
    const update = JSON.parse(event.body ?? "{}") as TgUpdate;

    // Verificación del secret: aplica a TODOS los updates (callback incluido).
    const expectedSecret = await d.getWebhookSecret();
    if (expectedSecret) {
      const got = event.headers?.["x-telegram-bot-api-secret-token"];
      if (got !== expectedSecret) {
        logger.warn("telegram webhook secret mismatch");
        return ok();
      }
    } else if (process.env.TELEGRAM_REQUIRE_SECRET === "true") {
      logger.error("telegram webhook secret required but missing; rejecting");
      return ok();
    }

    token = await d.getToken();

    // --- Rama 1: pulsación de botón inline ---
    if (update.callback_query) {
      return await handleCallback(d, token, update.callback_query);
    }

    const msg = update.message;
    if (!msg) return ok();
    if (msg.from?.is_bot) return ok();
    chatId = msg.chat.id;

    // Registro de usuario (aislado: un fallo aquí no rompe la respuesta).
    try {
      await d.tgUserRepo.upsert({
        chatId: msg.chat.id,
        username: msg.from?.username,
        firstName: msg.from?.first_name,
        lastName: msg.from?.last_name,
        languageCode: msg.from?.language_code,
        now: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn("no se pudo registrar el usuario de Telegram", {
        chatId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // --- Rama 2: el usuario compartió su ubicación ---
    if (msg.location) {
      return await handleLocation(d, token, msg, chatId);
    }

    if (!msg.text) return ok();

    const botUsername = await d.getBotUsername(token);
    const config = await d.configRepo.get();
    if (!shouldRespond(msg, botUsername, config.botTriggerMode)) return ok();

    // --- Rama 3a: comandos de menú / bienvenida ---
    if (isStartCommand(msg) || isMenuCommand(msg)) {
      const home = homeScreen();
      await d.sendMessage(token, chatId, home.text, {
        replyMarkup: home.replyMarkup,
      });
      return ok();
    }

    // --- Rama 3b: "Ver sin ubicación" (botón del teclado de ubicación) ---
    if (msg.text === SKIP_LOCATION_TEXT) {
      const state = await safeGetState(d, chatId);
      try {
        await d.menuState.clearPending(chatId);
      } catch (e) {
        logger.warn("no se pudo limpiar pendingCategory", {
          chatId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      const cat = state.pendingCategory;
      if (cat && LOCATION_ACTIONS.has(cat)) {
        const snap = await d.loadSnapshot();
        const screen = categoryScreen(cat, snap, undefined);
        await d.sendMessage(token, chatId, screen.text, {
          replyMarkup: screen.replyMarkup,
        });
      } else {
        const home = homeScreen();
        await d.sendMessage(token, chatId, home.text, {
          replyMarkup: home.replyMarkup,
        });
      }
      return ok();
    }

    // --- Rama 3c: pregunta libre (RAG + Bedrock, flujo original) ---
    const rl = await d.rateLimit.hit(String(chatId));
    if (!rl.allowed) {
      logger.warn("chat rate limited", { chatId, count: rl.count });
      await d.sendMessage(token, chatId, RATE_LIMITED);
      return ok();
    }

    const question = extractQuestion(msg, botUsername);
    const snap = await d.loadSnapshot();

    // "Cómo pedir ayuda": guía fija (pre-check barato y fiable).
    if (isHelpRequest(question)) {
      await d.sendMessage(token, chatId, HELP_GUIDE);
      await logQa(d, chatId, question, HELP_GUIDE, [], config.bedrockModelId, 0, 0);
      return ok();
    }

    // Agente: el modelo enruta la pregunta a una herramienta (contar/listar/
    // buscar) que opera sobre el snapshot COMPLETO. Si el tool-use falla
    // (p. ej. el modelo no lo soporta de forma fiable), degradamos al RAG.
    try {
      const r = await answerWithTools(question, snap, config, {
        routeTools: d.routeTools,
        askBedrock: d.askBedrock,
      });
      await d.sendMessage(token, chatId, r.reply);
      await logQa(
        d,
        chatId,
        question,
        r.reply,
        r.itemsUsed,
        config.bedrockModelId,
        r.tokensIn,
        r.tokensOut,
      );
      return ok();
    } catch (e) {
      logger.warn("agente tool-use falló; usando RAG clásico", {
        chatId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Fallback determinista: conteo si aplica, si no el RAG clásico.
    const count = countAnswer(question, snap);
    if (count) {
      await d.sendMessage(token, chatId, count);
      await logQa(d, chatId, question, count, [], config.bedrockModelId, 0, 0);
      return ok();
    }
    const items = retrieve(question, snap);
    if (items.length === 0) {
      await d.sendMessage(token, chatId, NO_DATA);
      await logQa(d, chatId, question, NO_DATA, [], config.bedrockModelId, 0, 0);
      return ok();
    }
    const ans = await d.askBedrock(
      config.bedrockModelId,
      config.systemPrompt,
      buildUserText(question, items),
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

async function handleCallback(
  d: Deps,
  token: string,
  cq: TgCallbackQuery,
): Promise<{ statusCode: number; body: string }> {
  const chatId = cq.message?.chat.id;
  try {
    if (chatId == null) return ok();
    const data = cq.data ?? "";
    const nav = navScreen(data);
    if (nav) {
      await d.sendMessage(token, chatId, nav.text, {
        replyMarkup: nav.replyMarkup,
      });
    } else if (LOCATION_ACTIONS.has(data)) {
      const state = await safeGetState(d, chatId);
      const loc = freshLoc(state, Date.now());
      if (loc) {
        const snap = await d.loadSnapshot();
        const screen = categoryScreen(data, snap, loc);
        await d.sendMessage(token, chatId, screen.text, {
          replyMarkup: screen.replyMarkup,
        });
      } else {
        try {
          await d.menuState.setPending(chatId, data);
        } catch (e) {
          logger.warn("no se pudo guardar pendingCategory", {
            chatId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        const prompt = locationPrompt(data);
        await d.sendMessage(token, chatId, prompt.text, {
          replyMarkup: prompt.replyMarkup,
        });
      }
    } else {
      const home = homeScreen();
      await d.sendMessage(token, chatId, home.text, {
        replyMarkup: home.replyMarkup,
      });
    }
  } catch (e) {
    logger.error("error manejando callback", {
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    try {
      await d.answerCallbackQuery(token, cq.id);
    } catch (e) {
      logger.warn("answerCallbackQuery falló", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return ok();
}

async function handleLocation(
  d: Deps,
  token: string,
  msg: TgMessage,
  chatId: number,
): Promise<{ statusCode: number; body: string }> {
  const loc = {
    lat: msg.location!.latitude,
    lng: msg.location!.longitude,
  };
  const state = await safeGetState(d, chatId);
  try {
    await d.menuState.setLocation(
      chatId,
      loc.lat,
      loc.lng,
      new Date().toISOString(),
    );
  } catch (e) {
    logger.warn("no se pudo guardar la ubicación", {
      chatId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const cat = state.pendingCategory;
  if (cat && LOCATION_ACTIONS.has(cat)) {
    const snap = await d.loadSnapshot();
    const screen = categoryScreen(cat, snap, loc);
    await d.sendMessage(token, chatId, screen.text, {
      replyMarkup: screen.replyMarkup,
    });
  } else {
    const home = homeScreen();
    await d.sendMessage(
      token,
      chatId,
      `📍 Ubicación guardada.\n\n${home.text}`,
      {
        replyMarkup: home.replyMarkup,
      },
    );
  }
  return ok();
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

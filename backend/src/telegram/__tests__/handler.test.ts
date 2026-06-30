import { describe, it, expect, vi } from "vitest";
import { handler } from "@/telegram/handler";
import { SKIP_LOCATION_TEXT } from "@/telegram/menu";
import type { Snapshot } from "@/telegram/types";

const snap: Snapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      {
        category: "acopios",
        sourceId: "s",
        externalId: "1",
        titulo: "Acopio Chacao",
        texto: "agua",
      },
    ],
  },
};

function deps(over = {}) {
  return {
    getToken: vi.fn(async () => "TOK"),
    getWebhookSecret: vi.fn(async () => ""),
    getBotUsername: vi.fn(async () => "vh_bot"),
    configRepo: {
      get: vi.fn(async () => ({
        scrapeRateMin: 30,
        bedrockModelId: "m",
        systemPrompt: "sys",
        botTriggerMode: "mention" as const,
      })),
    },
    qaLogRepo: { append: vi.fn(async () => {}) },
    rateLimit: { hit: vi.fn(async () => ({ allowed: true, count: 1 })) },
    tgUserRepo: {
      upsert: vi.fn(async () => {}),
      get: vi.fn(async () => null),
      recordStrike: vi.fn(async () => 1),
      resetStrikes: vi.fn(async () => {}),
      setBlocked: vi.fn(async () => {}),
    },
    loadSnapshot: vi.fn(async () => snap),
    askBedrock: vi.fn(async () => ({
      text: "Hay acopio en Chacao.",
      tokensIn: 10,
      tokensOut: 5,
    })),
    // Por defecto el router elige "buscar" → mantiene el flujo RAG clásico.
    routeTools: vi.fn(async () => ({
      name: "buscar",
      input: {},
      tokensIn: 1,
      tokensOut: 1,
    })),
    sendMessage: vi.fn(async () => {}),
    answerCallbackQuery: vi.fn(async () => {}),
    menuState: {
      get: vi.fn(async () => ({})),
      setPending: vi.fn(async () => {}),
      setLocation: vi.fn(async () => {}),
      clearPending: vi.fn(async () => {}),
      setPendingSearch: vi.fn(async () => {}),
      clearPendingSearch: vi.fn(async () => {}),
    },
    ...over,
  };
}

function event(text: string, extra = {}) {
  return {
    body: JSON.stringify({
      message: {
        message_id: 1,
        text,
        chat: { id: 9, type: "group" },
        from: { id: 2, username: "ana" },
        ...extra,
      },
    }),
  };
}

function callbackEvent(data: string, chatId = 9) {
  return {
    body: JSON.stringify({
      callback_query: {
        id: "cb1",
        from: { id: 2, username: "ana" },
        message: { message_id: 1, chat: { id: chatId, type: "private" } },
        data,
      },
    }),
  };
}

function locationEvent(lat: number, lng: number, chatId = 9) {
  return {
    body: JSON.stringify({
      message: {
        message_id: 1,
        chat: { id: chatId, type: "private" },
        from: { id: 2, username: "ana" },
        location: { latitude: lat, longitude: lng },
      },
    }),
  };
}

describe("telegram handler", () => {
  it("ignores messages that should not trigger (returns 200, no reply)", async () => {
    const d = deps();
    const res = await handler(event("hola a todos"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("fails closed when no secret is configured and TELEGRAM_REQUIRE_SECRET=true", async () => {
    process.env.TELEGRAM_REQUIRE_SECRET = "true";
    try {
      const d = deps({ getWebhookSecret: vi.fn(async () => "") });
      const res = await handler(event("@vh_bot dónde hay agua"), d as any);
      expect(res.statusCode).toBe(200);
      expect(d.sendMessage).not.toHaveBeenCalled();
      expect(d.askBedrock).not.toHaveBeenCalled();
    } finally {
      delete process.env.TELEGRAM_REQUIRE_SECRET;
    }
  });

  it("answers a mention: retrieves, calls bedrock, sends, logs", async () => {
    const d = deps();
    const res = await handler(event("@vh_bot dónde hay agua"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.askBedrock).toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      "Hay acopio en Chacao.",
    );
    expect(d.qaLogRepo.append).toHaveBeenCalled();
  });

  it("on zero retrieval, replies with guidance and skips bedrock", async () => {
    const d = deps();
    await handler(event("@vh_bot xyzzy plutonio"), d as any);
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.qaLogRepo.append).toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      expect.stringContaining("No encontré"),
    );
  });

  it("'buscar a una persona' (sin nombre) → pide el nombre y guarda pendingSearch", async () => {
    const d = deps();
    await handler(
      event("buscar a una persona", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    // No corta con "No tengo": pide el nombre (clarificación).
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      expect.stringMatching(/a quién buscas|nombre y apellido/i),
    );
    expect(d.menuState.setPendingSearch).toHaveBeenCalledWith(
      9,
      "persona",
      expect.any(String),
    );
    expect(d.routeTools).not.toHaveBeenCalled();
  });

  it("con pendingSearch activo, el siguiente mensaje se busca por nombre (sin router)", async () => {
    const d = deps({
      menuState: {
        get: vi.fn(async () => ({
          pendingSearch: "persona",
          pendingSearchAt: new Date().toISOString(),
        })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
        setPendingSearch: vi.fn(async () => {}),
        clearPendingSearch: vi.fn(async () => {}),
      },
    });
    await handler(
      event("Pedro Gonzalez", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    // Búsqueda determinista: no pasa por el router LLM y limpia el estado.
    expect(d.routeTools).not.toHaveBeenCalled();
    expect(d.menuState.clearPendingSearch).toHaveBeenCalledWith(9);
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      expect.stringContaining("Pedro Gonzalez"),
    );
  });

  it("'necesito ayuda' → muestra el menú de recursos con botones (no texto seco)", async () => {
    const d = deps();
    await handler(
      event("necesito ayuda", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.routeTools).not.toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      expect.stringMatching(/NECESITO AYUDA/i),
      expect.objectContaining({ replyMarkup: expect.anything() }),
    );
  });

  it("'acopios' (sin zona) → pide la ubicación y recuerda la categoría", async () => {
    const d = deps();
    await handler(
      event("acopios", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.routeTools).not.toHaveBeenCalled();
    expect(d.menuState.setPending).toHaveBeenCalledWith(9, "insumos");
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      expect.stringMatching(/ubicación/i),
      expect.objectContaining({ replyMarkup: expect.anything() }),
    );
  });

  it("on /start, sends a welcome message and skips retrieval/bedrock", async () => {
    const d = deps();
    const res = await handler(
      event("/start", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(res.statusCode).toBe(200);
    expect(d.loadSnapshot).not.toHaveBeenCalled();
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledTimes(1);
    const [, , text] = (d.sendMessage as any).mock.calls[0];
    expect(text).toContain("VenezuelaHelp");
    expect(text.toLowerCase()).toContain("lenguaje natural");
  });

  it("on /start with a deep-link payload, still welcomes", async () => {
    const d = deps();
    await handler(
      event("/start ref123", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("rate-limits a chat: replies with a notice and skips retrieval/bedrock/log", async () => {
    const d = deps({
      rateLimit: { hit: vi.fn(async () => ({ allowed: false, count: 11 })) },
    });
    const res = await handler(event("@vh_bot dónde hay agua"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.loadSnapshot).not.toHaveBeenCalled();
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.qaLogRepo.append).not.toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      expect.stringContaining("muy rápido"),
    );
  });

  it("does not consume the rate limit on /start welcome", async () => {
    const hit = vi.fn(async () => ({ allowed: true, count: 1 }));
    const d = deps({ rateLimit: { hit } });
    await handler(
      event("/start", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(hit).not.toHaveBeenCalled();
  });

  it("rejects webhook when secret mismatch (returns 200, no reply)", async () => {
    const d = deps({
      getWebhookSecret: vi.fn(async () => "topsecret"),
    });
    const res = await handler(
      { body: event("@vh_bot dónde hay agua").body, headers: {} },
      d as any,
    );
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).not.toHaveBeenCalled();
    expect(d.askBedrock).not.toHaveBeenCalled();
  });

  it("on bedrock error, sends a fallback and still returns 200", async () => {
    const d = deps({
      askBedrock: vi.fn(async () => {
        throw new Error("ThrottlingException");
      }),
    });
    const res = await handler(event("@vh_bot dónde hay agua"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).toHaveBeenCalled(); // fallback message
  });

  it("captures the Telegram user (upsert) with identity from the message", async () => {
    const d = deps();
    await handler(
      event("@vh_bot dónde hay agua", {
        from: {
          id: 2,
          username: "ana",
          first_name: "Ana",
          language_code: "es",
        },
      }),
      d as any,
    );
    expect(d.tgUserRepo.upsert).toHaveBeenCalledOnce();
    const arg = (d.tgUserRepo.upsert as any).mock.calls[0][0];
    expect(arg).toMatchObject({
      chatId: 9,
      username: "ana",
      firstName: "Ana",
      languageCode: "es",
    });
  });

  it("a failing user upsert does not break the bot reply", async () => {
    const d = deps({
      tgUserRepo: {
        upsert: vi.fn(async () => {
          throw new Error("ddb down");
        }),
      },
    });
    const res = await handler(event("@vh_bot dónde hay agua"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      "Hay acopio en Chacao.",
    );
  });

  it("callback 'home' responde con teclado inline y SIEMPRE answerCallbackQuery", async () => {
    const d = deps();
    await handler(callbackEvent("home"), d as any);
    expect(d.sendMessage).toHaveBeenCalledTimes(1);
    const opts = (d.sendMessage as any).mock.calls[0][3];
    expect(opts.replyMarkup.inline_keyboard).toBeTruthy();
    expect(d.answerCallbackQuery).toHaveBeenCalledWith("TOK", "cb1");
    expect(d.askBedrock).not.toHaveBeenCalled();
  });

  it("callback de categoría sin ubicación fresca pide ubicación y guarda pending", async () => {
    const d = deps();
    await handler(callbackEvent("refugios"), d as any);
    expect(d.menuState.setPending).toHaveBeenCalledWith(9, "refugios");
    const opts = (d.sendMessage as any).mock.calls[0][3];
    expect(opts.replyMarkup.keyboard).toBeTruthy(); // reply keyboard con request_location
  });

  it("callback de categoría con ubicación fresca renderiza directo", async () => {
    const d = deps({
      menuState: {
        get: vi.fn(async () => ({
          lastLat: 10,
          lastLng: -66,
          lastLocationAt: new Date().toISOString(),
        })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
      },
    });
    await handler(callbackEvent("refugios"), d as any);
    expect(d.menuState.setPending).not.toHaveBeenCalled();
    const opts = (d.sendMessage as any).mock.calls[0][3];
    expect(opts.replyMarkup.inline_keyboard).toBeTruthy();
  });

  it("mensaje de ubicación renderiza la categoría pendiente y persiste la ubicación", async () => {
    const d = deps({
      menuState: {
        get: vi.fn(async () => ({ pendingCategory: "refugios" })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
      },
    });
    await handler(locationEvent(10.5, -66.9), d as any);
    expect(d.menuState.setLocation).toHaveBeenCalledWith(
      9,
      10.5,
      -66.9,
      expect.any(String),
    );
    expect(d.sendMessage).toHaveBeenCalled();
    expect(d.askBedrock).not.toHaveBeenCalled();
  });

  it("una pregunta libre SIGUE yendo a RAG+Bedrock (regresión)", async () => {
    const d = deps();
    await handler(
      event("dónde hay agua", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.askBedrock).toHaveBeenCalled();
  });

  it("SKIP_LOCATION_TEXT limpia pending y muestra categoría con teclado inline (sin Bedrock)", async () => {
    const d = deps({
      menuState: {
        get: vi.fn(async () => ({ pendingCategory: "refugios" })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
      },
    });
    await handler(
      event(SKIP_LOCATION_TEXT, { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.menuState.clearPending).toHaveBeenCalledWith(9);
    expect(d.sendMessage).toHaveBeenCalled();
    const opts = (d.sendMessage as any).mock.calls[0][3];
    expect(opts.replyMarkup.inline_keyboard).toBeTruthy();
    expect(d.askBedrock).not.toHaveBeenCalled();
  });

  it("responde un conteo agregado (issue #15) sin llamar a Bedrock", async () => {
    const countSnap: Snapshot = {
      generatedAt: "t",
      categories: {
        desaparecidos: [
          {
            category: "desaparecidos",
            sourceId: "a",
            externalId: "1",
            titulo: "P1",
            texto: "",
          },
          {
            category: "desaparecidos",
            sourceId: "b",
            externalId: "2",
            titulo: "P2",
            texto: "",
          },
        ],
      },
    };
    const d = deps({
      loadSnapshot: vi.fn(async () => countSnap),
      routeTools: vi.fn(async () => ({
        name: "contar",
        input: { category: "desaparecidos" },
        tokensIn: 1,
        tokensOut: 1,
      })),
    });
    await handler(
      event("Personas desaparecidas número", {
        chat: { id: 9, type: "private" },
      }),
      d as any,
    );
    expect(d.askBedrock).not.toHaveBeenCalled();
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply).toContain("2");
    expect(reply).toContain("personas desaparecidas");
  });

  it("saludo puro 'hola' → saludo fijo, sin router ni Bedrock", async () => {
    const d = deps();
    await handler(
      event("hola", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.routeTools).not.toHaveBeenCalled();
    expect(d.askBedrock).not.toHaveBeenCalled();
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply).toContain("VenezuelaHelp");
  });

  it("usuario bloqueado → aviso de bloqueo, sin router ni Bedrock", async () => {
    const d = deps({
      tgUserRepo: {
        upsert: vi.fn(async () => {}),
        get: vi.fn(async () => ({ chatId: 9, blocked: true })),
        recordStrike: vi.fn(async () => 0),
        resetStrikes: vi.fn(async () => {}),
        setBlocked: vi.fn(async () => {}),
      },
    });
    await handler(
      event("dónde hay agua", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.routeTools).not.toHaveBeenCalled();
    expect(d.askBedrock).not.toHaveBeenCalled();
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply.toLowerCase()).toContain("bloqueado");
  });

  it("fuera de tema con strikes < max → aviso + strike, sin bloquear", async () => {
    const setBlocked = vi.fn(async () => {});
    const d = deps({
      tgUserRepo: {
        upsert: vi.fn(async () => {}),
        get: vi.fn(async () => null),
        recordStrike: vi.fn(async () => 1),
        resetStrikes: vi.fn(async () => {}),
        setBlocked,
      },
      routeTools: vi.fn(async () => ({
        name: "fuera_de_tema",
        input: {},
        tokensIn: 1,
        tokensOut: 1,
      })),
    });
    await handler(
      event("cuéntame un chiste", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect((d.tgUserRepo as any).recordStrike).toHaveBeenCalled();
    expect(setBlocked).not.toHaveBeenCalled();
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply.toLowerCase()).toContain("terremoto");
  });

  it("fuera de tema que alcanza el umbral → bloquea + aviso de bloqueo", async () => {
    const setBlocked = vi.fn(async () => {});
    const d = deps({
      tgUserRepo: {
        upsert: vi.fn(async () => {}),
        get: vi.fn(async () => ({ chatId: 9, strikes: 2 })),
        recordStrike: vi.fn(async () => 3),
        resetStrikes: vi.fn(async () => {}),
        setBlocked,
      },
      routeTools: vi.fn(async () => ({
        name: "fuera_de_tema",
        input: {},
        tokensIn: 1,
        tokensOut: 1,
      })),
    });
    await handler(
      event("otra vez fuera de tema", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(setBlocked).toHaveBeenCalledWith(
      9,
      true,
      expect.any(String),
      expect.any(String),
    );
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply.toLowerCase()).toContain("bloqueado");
  });

  it("lista ítems sobre todo el snapshot (issue: listar) sin Bedrock", async () => {
    const listSnap: Snapshot = {
      generatedAt: "t",
      categories: {
        desaparecidos: Array.from({ length: 25 }, (_, i) => ({
          category: "desaparecidos",
          sourceId: "x",
          externalId: String(i),
          titulo: `Persona ${i}`,
          texto: "",
        })),
      },
    };
    const d = deps({
      loadSnapshot: vi.fn(async () => listSnap),
      routeTools: vi.fn(async () => ({
        name: "listar",
        input: { category: "desaparecidos", limite: 20 },
        tokensIn: 1,
        tokensOut: 1,
      })),
    });
    await handler(
      event("dame los nombres de los desaparecidos", {
        chat: { id: 9, type: "private" },
      }),
      d as any,
    );
    expect(d.askBedrock).not.toHaveBeenCalled();
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply).toContain("📋");
    expect(reply).toContain("Persona 0");
    expect(reply).toContain("de 25"); // total real, no la muestra
  });

  it("guía al usuario para pedir ayuda (issue #15) sin llamar a Bedrock", async () => {
    const d = deps();
    await handler(
      event("Cómo puedo solicitar ayuda", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.askBedrock).not.toHaveBeenCalled();
    const reply = (d.sendMessage as any).mock.calls[0][2] as string;
    expect(reply).toMatch(/pedir ayuda/i);
    expect(reply).toContain("NECESITO AYUDA");
  });
});

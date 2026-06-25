import { describe, it, expect, vi } from "vitest";
import { handler } from "@/telegram/handler";
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
    loadSnapshot: vi.fn(async () => snap),
    askBedrock: vi.fn(async () => ({
      text: "Hay acopio en Chacao.",
      tokensIn: 10,
      tokensOut: 5,
    })),
    sendMessage: vi.fn(async () => {}),
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

describe("telegram handler", () => {
  it("ignores messages that should not trigger (returns 200, no reply)", async () => {
    const d = deps();
    const res = await handler(event("hola a todos"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).not.toHaveBeenCalled();
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

  it("on zero retrieval, replies canned and skips bedrock", async () => {
    const d = deps();
    await handler(event("@vh_bot xyzzy plutonio"), d as any);
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalled();
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
});

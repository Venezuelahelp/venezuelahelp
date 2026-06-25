import { describe, it, expect } from "vitest";
import { shouldRespond, extractQuestion } from "@/telegram/trigger";
import type { TgMessage } from "@/telegram/types";

const base = (text: string, extra: Partial<TgMessage> = {}): TgMessage => ({
  message_id: 1,
  text,
  chat: { id: 10, type: "group" },
  from: { id: 2, username: "ana" },
  ...extra,
});

describe("shouldRespond", () => {
  it("mention mode: responds when bot is @mentioned", () => {
    const msg = base("hola @vh_bot dónde hay acopios", {
      entities: [{ type: "mention", offset: 5, length: 7 }],
    });
    expect(shouldRespond(msg, "vh_bot", "mention")).toBe(true);
  });
  it("mention mode: responds to a reply to the bot", () => {
    const msg = base("y desaparecidos?", {
      reply_to_message: { from: { id: 9, is_bot: true, username: "vh_bot" } },
    });
    expect(shouldRespond(msg, "vh_bot", "mention")).toBe(true);
  });
  it("mention mode: ignores a normal group message", () => {
    expect(shouldRespond(base("hola a todos"), "vh_bot", "mention")).toBe(
      false,
    );
  });
  it("command mode: responds to /pregunta and /p", () => {
    expect(
      shouldRespond(base("/pregunta dónde hay agua"), "vh_bot", "command"),
    ).toBe(true);
    expect(shouldRespond(base("/p dónde hay agua"), "vh_bot", "command")).toBe(
      true,
    );
    expect(shouldRespond(base("hola"), "vh_bot", "command")).toBe(false);
  });
  it("all mode: responds to any non-empty text", () => {
    expect(shouldRespond(base("cualquier cosa"), "vh_bot", "all")).toBe(true);
    expect(shouldRespond(base(""), "vh_bot", "all")).toBe(false);
  });
});

describe("extractQuestion", () => {
  it("strips the @mention", () => {
    expect(extractQuestion(base("@vh_bot dónde hay acopios"), "vh_bot")).toBe(
      "dónde hay acopios",
    );
  });
  it("strips the /pregunta and /p command", () => {
    expect(extractQuestion(base("/pregunta dónde hay agua"), "vh_bot")).toBe(
      "dónde hay agua",
    );
    expect(extractQuestion(base("/p@vh_bot dónde hay agua"), "vh_bot")).toBe(
      "dónde hay agua",
    );
  });
});

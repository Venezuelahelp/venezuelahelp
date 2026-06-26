import type { TgMessage, TriggerMode } from "@/telegram/types";

const CMD = /^\/(pregunta|p)(@\w+)?\b/i;
const START = /^\/start(@\w+)?\b/i;

// El deep link `t.me/<bot>?start=<payload>` envía "/start" (con payload opcional).
// La primera interacción no es una pregunta: hay que dar la bienvenida.
export function isStartCommand(msg: TgMessage): boolean {
  return START.test((msg.text ?? "").trim());
}

function isMentioned(msg: TgMessage, botUsername: string): boolean {
  return (msg.text ?? "")
    .toLowerCase()
    .includes(`@${botUsername.toLowerCase()}`);
}

function isReplyToBot(msg: TgMessage, botUsername: string): boolean {
  const u = msg.reply_to_message?.from;
  return !!u && u.username?.toLowerCase() === botUsername.toLowerCase();
}

export function shouldRespond(
  msg: TgMessage,
  botUsername: string,
  mode: TriggerMode,
): boolean {
  const text = (msg.text ?? "").trim();
  if (!text) return false;
  // En un chat 1-a-1 con el bot, responder a cualquier mensaje (sin comando):
  // la CTA del sitio abre un chat privado y el usuario solo escribe su pregunta.
  if (msg.chat.type === "private") return true;
  if (mode === "all") return true;
  if (CMD.test(text)) return true;
  if (mode === "mention")
    return isMentioned(msg, botUsername) || isReplyToBot(msg, botUsername);
  return false;
}

export function extractQuestion(msg: TgMessage, botUsername: string): string {
  let t = (msg.text ?? "").trim();
  t = t.replace(CMD, "").trim();
  t = t.replace(new RegExp(`@${botUsername}`, "ig"), "").trim();
  return t.replace(/\s+/g, " ").trim();
}

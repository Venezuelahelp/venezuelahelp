import type { TgMessage, TriggerMode } from "@/telegram/types";

const CMD = /^\/(pregunta|p)(@\w+)?\b/i;

function isMentioned(msg: TgMessage, botUsername: string): boolean {
  return (msg.text ?? "")
    .toLowerCase()
    .includes(`@${botUsername.toLowerCase()}`);
}

function isReplyToBot(msg: TgMessage, botUsername: string): boolean {
  const u = msg.reply_to_message?.from;
  return (
    !!u &&
    (u.is_bot === true ||
      u.username?.toLowerCase() === botUsername.toLowerCase())
  );
}

export function shouldRespond(
  msg: TgMessage,
  botUsername: string,
  mode: TriggerMode,
): boolean {
  const text = (msg.text ?? "").trim();
  if (!text) return false;
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

export interface TgUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface TgMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: TgUser;
  reply_to_message?: { from?: TgUser };
  entities?: Array<{ type: string; offset: number; length: number }>;
}

export interface TgUpdate {
  message?: TgMessage;
}

export type TriggerMode = "mention" | "command" | "all";

export interface PublicItem {
  category: string;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: { lat: number; lng: number; nombre?: string };
  status?: string;
  trust?: string;
}

export interface Snapshot {
  generatedAt: string;
  categories: Record<string, PublicItem[]>;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
export interface KeyboardButton {
  text: string;
  request_location?: boolean;
}
export interface ReplyKeyboardMarkup {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}
export interface RemoveKeyboard {
  remove_keyboard: true;
}
export type ReplyMarkup =
  | InlineKeyboardMarkup
  | ReplyKeyboardMarkup
  | RemoveKeyboard;

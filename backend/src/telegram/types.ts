export interface TgUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface TgLocation {
  latitude: number;
  longitude: number;
}

export interface TgMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: TgUser;
  reply_to_message?: { from?: TgUser };
  entities?: Array<{ type: string; offset: number; length: number }>;
  location?: TgLocation;
}

export interface TgCallbackQuery {
  id: string;
  from?: TgUser;
  message?: { message_id: number; chat: { id: number; type: string } };
  data?: string;
}

export interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
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
  // Permalink del ítem en su origen (si la fuente lo provee).
  sourceUrl?: string;
  // Marcas de enrichment (opcionales: snapshots viejos no las traen).
  trust?: "verificado" | "corroborado" | "no_verificado" | "sospechoso";
  isCanonical?: boolean;
  dupOf?: string;
  sourcesCount?: number;
  trustReasons?: string[];
  // Clase canónica del status (solo desaparecidos; snapshots viejos no la traen).
  statusClass?: "buscando" | "localizado";
}

export interface Snapshot {
  generatedAt: string;
  categories: Record<string, PublicItem[]>;
  // Cruce "posibles localizaciones" (opcional: snapshots viejos no lo traen).
  matches?: import("@/shared/types").LocatedMatch[];
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
  InlineKeyboardMarkup | ReplyKeyboardMarkup | RemoveKeyboard;

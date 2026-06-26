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
  // Marcas de enrichment (opcionales: snapshots viejos no las traen).
  trust?: "verificado" | "corroborado" | "no_verificado" | "sospechoso";
  isCanonical?: boolean;
  dupOf?: string;
  sourcesCount?: number;
  trustReasons?: string[];
}

export interface Snapshot {
  generatedAt: string;
  categories: Record<string, PublicItem[]>;
}

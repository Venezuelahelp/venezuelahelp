export const CATEGORIES = [
  "reportes",
  "desaparecidos",
  "acopios",
  "edificios",
  "solicitudes",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
  nombre?: string;
}

export interface NormalizedItem {
  category: Category;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: GeoPoint;
  status?: string;
  raw: unknown;
}

export interface StoredItem extends NormalizedItem {
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Source {
  id: string;
  nombre: string;
  url: string;
  connector: "jsonApi" | "headless";
  endpoint?: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: "ok" | "error";
  errorMsg?: string;
}

export interface Config {
  scrapeRateMin: number;
  bedrockModelId: string;
  systemPrompt: string;
  botTriggerMode: "mention" | "command" | "all";
}

export interface QaLogEntry {
  chatId: string;
  ts: string;
  pregunta: string;
  respuesta: string;
  itemsUsados: string[];
  tokensIn: number;
  tokensOut: number;
  modelo: string;
  costoEstimado: number;
  flagged: boolean;
}

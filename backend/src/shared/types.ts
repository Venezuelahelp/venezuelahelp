export const CATEGORIES = [
  "reportes",
  "desaparecidos",
  "acopios",
  "edificios",
  "solicitudes",
  "hospitales",
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
  // URL absoluta de la foto en la fuente original (hotlink). Opcional: muchas
  // fuentes/ítems no traen imagen. No re-hospedamos (Fase 1).
  imageUrl?: string;
  // URL absoluta http(s) del ítem en su origen (permalink). Preferimos el link
  // real que da la API (p.ej. el post de TikTok/IG); si la fuente no lo da, un
  // deep-link construido. Viaja en el snapshot (no se persiste `raw`).
  sourceUrl?: string;
  raw: unknown;
}

export interface StoredItem extends NormalizedItem {
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

// Resultado de un endpoint individual en la última corrida del motor `rest`.
// Permite distinguir "ok con 0 ítems" de "roto" en el admin.
export interface EndpointStat {
  label: string;
  fetched: number;
  error?: string;
}

export interface Source {
  id: string;
  nombre: string;
  url: string;
  connector: "jsonApi" | "headless" | "ai" | "rest";
  endpoint?: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: "ok" | "error";
  // Estado enriquecido. "blocked" = fuente conocida pero inalcanzable por gating
  // (reCAPTCHA/Cloudflare); no es error ni se reintenta como tal.
  status?: "ok" | "error" | "blocked";
  errorMsg?: string;
  extractHint?: string;
  lastContentHash?: string;
  lastExtractAt?: string;
  // Config del motor declarativo (solo si connector === "rest").
  rest?: import("@/connectors/restConfig").RestConfig;
  // Total de ítems traídos en la última corrida (no upserts).
  lastFetched?: number;
  // Resultado por endpoint de la última corrida.
  endpointStats?: EndpointStat[];
  // Nivel de confianza de la fuente. "official" eleva sus ítems a "verificado".
  // Hoy ninguna fuente lo es; queda listo para Protección Civil/bomberos.
  trustLevel?: "official";
}

// Parámetros del enriquecimiento (dedupe + confianza). Viven en CONFIG#GLOBAL
// para poder ajustarlos sin redeploy.
export interface EnrichmentConfig {
  geocerca: { latMin: number; latMax: number; lngMin: number; lngMax: number };
  blocklist: string[];
  jaccardThreshold: number;
  geoCellSize: number;
  minTextLen: number;
}

export type TrustLevel =
  "verificado" | "corroborado" | "no_verificado" | "sospechoso";

// Marcas derivadas por ítem, calculadas al construir el snapshot. No se
// persisten en DynamoDB: viajan dentro del snapshot.json.
export interface ItemEnrichment {
  clusterKey: string;
  isCanonical: boolean;
  dupOf?: string;
  sourcesCount: number;
  trust: TrustLevel;
  trustReasons: string[];
}

export interface Config {
  scrapeRateMin: number;
  bedrockModelId: string;
  systemPrompt: string;
  botTriggerMode: "mention" | "command" | "all";
  enrichment: EnrichmentConfig;
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

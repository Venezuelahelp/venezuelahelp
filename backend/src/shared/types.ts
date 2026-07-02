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
  // Solo en `desaparecidos`: clase canónica del status crudo, calculada con
  // classifyLocated (matchLocated.ts) al construir el snapshot. "otro" no se
  // emite (campo ausente). El frontend/bot usan SOLO este campo, nunca
  // parsean `status` crudo.
  statusClass?: "buscando" | "localizado";
}

// Moderación del bot: cuántos mensajes fuera de tema / no permitidos seguidos
// (strikes) se toleran antes de bloquear al usuario. Editable sin deploy.
export interface ModerationConfig {
  maxStrikes: number;
}

export interface Config {
  scrapeRateMin: number;
  bedrockModelId: string;
  systemPrompt: string;
  botTriggerMode: "mention" | "command" | "all";
  enrichment: EnrichmentConfig;
  moderation: ModerationConfig;
}

// Solicitud de acceso al API público para terceros. La crea el form público;
// la gestiona el admin (aprobar/rechazar). Los datos personales del solicitante
// se guardan solo para verificación/contacto.
export interface ApiAccessRequest {
  id: string;
  nombre: string;
  email: string;
  organizacion?: string;
  motivo: string;
  descripcion?: string;
  status: "pendiente" | "aprobada" | "rechazada";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  // Id de la API key emitida al aprobar (no el valor en claro).
  apiKeyId?: string;
}

// API key emitida a un consumidor. En DynamoDB la PK es APIKEY#<sha256(valor)>;
// el valor en claro se entrega una sola vez al aprobar y nunca se persiste.
export interface ApiKey {
  keyId: string;
  consumerName: string;
  email: string;
  requestId: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
}

// Cruce "posibles localizaciones": una persona reportada como buscada que
// aparece reportada como localizada/en hospital por otra(s) fuente(s). Se
// calcula en buildSnapshot (determinista, sin LLM) y viaja en el snapshot.json.
export type LocatedClass = "buscando" | "localizado" | "otro";

export type LocatedSignal =
  "cédula" | "teléfono" | "hospital" | "nombre-fuerte";

export interface LocatedMatch {
  nombre: string;
  signal: LocatedSignal;
  // Fuentes distintas que respaldan la localización (≥2 ⇒ azul en el público).
  locatedSourcesCount: number;
  missing: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
  };
  located: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
    hospital?: string;
    // Todos los sourceId que reportan localizado para este nombre.
    sources: string[];
  };
}

// Rama del handler que produjo la respuesta (telemetría; Bloque C1).
// Nota: "agent_error_fallback" NO forma parte de esta unión — ese valor solo
// va al log estructurado de CloudWatch (logger.error), nunca a QaLogEntry.
export type QaIntent =
  | "greeting"
  | "bare_search"
  | "pending_search"
  | "help_cry"
  | "help_guide"
  | "bare_category"
  | "agent_saludar"
  | "agent_rechazado"
  | "agent_contar"
  | "agent_listar"
  | "agent_buscar"
  | "rag_count"
  | "rag_retrieve";

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
  intent?: QaIntent;
}

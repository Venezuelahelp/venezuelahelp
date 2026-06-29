export interface Config {
  scrapeRateMin: number;
  bedrockModelId: string;
  systemPrompt: string;
  botTriggerMode: string;
}

export interface FieldMap {
  externalId: string;
  titulo: string;
  texto?: string[];
  lat?: string;
  lng?: string;
  imageUrl?: string;
  sourceUrl?: string;
  sourceUrlTemplate?: string;
  status?: string;
}

export interface RestEndpoint {
  label: string;
  url: string;
  category: string;
  itemsPath?: string;
  shape?: "array" | "geojson";
  fieldMap: FieldMap;
  headers?: Record<string, string>;
}

export interface RestConfig {
  base: string;
  endpoints: RestEndpoint[];
}

export interface EndpointStat {
  label: string;
  fetched: number;
  error?: string;
}

export interface Source {
  id: string;
  nombre: string;
  url: string;
  connector: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: string;
  status?: "ok" | "error" | "blocked";
  lastFetched?: number;
  endpointStats?: EndpointStat[];
  rest?: RestConfig;
  extractHint?: string;
}

export interface Stats {
  counts: Record<string, number>;
  sources: Array<{
    id: string;
    nombre: string;
    enabled: boolean;
    connector?: string;
    lastRun?: string;
    lastStatus?: string;
    status?: "ok" | "error" | "blocked";
    lastFetched?: number;
    endpointStats?: EndpointStat[];
  }>;
}

export interface ProbeResult {
  endpointStats: EndpointStat[];
  sample: Array<{
    category: string;
    titulo: string;
    texto: string;
    sourceUrl?: string;
    imageUrl?: string;
    ubicacion?: { lat: number; lng: number; nombre?: string };
  }>;
}

export interface DimCount {
  key: string;
  count: number;
}

export interface VisitEvent {
  ts: string;
  country: string;
  browser: string;
  device: string;
  os: string;
  path: string;
  referrer: string;
}

export interface Analytics {
  kpis: { today: number; last7: number; last30: number };
  byCountry: DimCount[];
  byBrowser: DimCount[];
  byDevice: DimCount[];
  recent: VisitEvent[];
}

export interface TgUser {
  chatId: number;
  username?: string;
  nombre: string;
  languageCode?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  msgCount: number;
}

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
  apiKeyId?: string;
}

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

// Respuesta de aprobar: incluye la key en claro UNA sola vez.
export interface ApproveResult {
  request: ApiAccessRequest;
  apiKey: ApiKey;
  rawKey: string;
}

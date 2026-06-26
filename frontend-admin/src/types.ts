export interface Config {
  scrapeRateMin: number;
  bedrockModelId: string;
  systemPrompt: string;
  botTriggerMode: string;
}

export interface Source {
  id: string;
  nombre: string;
  url: string;
  connector: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: string;
  extractHint?: string;
}

export interface Stats {
  counts: Record<string, number>;
  sources: Array<{
    id: string;
    nombre: string;
    enabled: boolean;
    lastRun?: string;
    lastStatus?: string;
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

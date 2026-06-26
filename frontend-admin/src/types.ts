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

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { CONFIG_KEY } from "@/shared/keys";
import type { Config, EnrichmentConfig } from "@/shared/types";

const DEFAULT_ENRICHMENT: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: ["xxx", "test troll", "lorem ipsum"],
  // 0.7: umbral más estricto para la fusión por texto en reportes/solicitudes
  // (reduce duplicados difusos; ajustado tras observar la 1ª pasada en prod).
  jaccardThreshold: 0.7,
  geoCellSize: 0.01,
  minTextLen: 10,
};

const DEFAULT_CONFIG: Config = {
  scrapeRateMin: 30,
  bedrockModelId: "amazon.nova-lite-v1:0",
  systemPrompt:
    "Eres un asistente sobre el terremoto de Venezuela. Responde en español, solo con la información provista, cita la fuente y di 'No tengo ese dato' si no hay información relevante.",
  botTriggerMode: "mention",
  enrichment: DEFAULT_ENRICHMENT,
};

export class ConfigRepo {
  async get(): Promise<Config> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: CONFIG_KEY }),
    );
    if (!res.Item) return { ...DEFAULT_CONFIG };
    return {
      scrapeRateMin: res.Item.scrapeRateMin,
      bedrockModelId: res.Item.bedrockModelId,
      systemPrompt: res.Item.systemPrompt,
      botTriggerMode: res.Item.botTriggerMode,
      enrichment:
        (res.Item.enrichment as EnrichmentConfig) ?? DEFAULT_ENRICHMENT,
    };
  }

  async put(config: Config): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...CONFIG_KEY, ...config },
      }),
    );
  }
}

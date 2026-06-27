import type { SourceConnector } from "@/connectors/types";
import { sismovenezuela } from "@/connectors/sismovenezuela";
import { terremotovenezuela } from "@/connectors/terremotovenezuela";
import { ninosvenezuela } from "@/connectors/ninosvenezuela";

const REGISTRY: Record<string, SourceConnector> = {
  [sismovenezuela.id]: sismovenezuela,
  [terremotovenezuela.id]: terremotovenezuela,
  [ninosvenezuela.id]: ninosvenezuela,
};

export function getConnector(sourceId: string): SourceConnector | undefined {
  return REGISTRY[sourceId];
}

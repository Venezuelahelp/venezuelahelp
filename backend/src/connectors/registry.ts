import type { SourceConnector } from "@/connectors/types";
import { terremotovenezuela } from "@/connectors/terremotovenezuela";
import { ninosvenezuela } from "@/connectors/ninosvenezuela";
import { hospitalesvenezuela } from "@/connectors/hospitalesvenezuela";

// Conectores bespoke (lógica irregular para el motor `rest`): terremotovenezuela
// (categoría por tipo en un mismo endpoint), ninosvenezuela/hospitalesvenezuela
// (composición de texto etiquetada de Supabase). sismovenezuela migró a `rest`
// (ver presets.ts) y se resuelve por runRestSource, no por este registry.
const REGISTRY: Record<string, SourceConnector> = {
  [terremotovenezuela.id]: terremotovenezuela,
  [ninosvenezuela.id]: ninosvenezuela,
  [hospitalesvenezuela.id]: hospitalesvenezuela,
};

export function getConnector(sourceId: string): SourceConnector | undefined {
  return REGISTRY[sourceId];
}

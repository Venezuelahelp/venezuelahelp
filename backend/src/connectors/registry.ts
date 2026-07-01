import type { SourceConnector } from "@/connectors/types";
import { terremotovenezuela } from "@/connectors/terremotovenezuela";
import { ninosvenezuela } from "@/connectors/ninosvenezuela";
import { hospitalesvenezuela } from "@/connectors/hospitalesvenezuela";
import { sosvenezuela2026 } from "@/connectors/sosvenezuela2026";

// Conectores bespoke (lógica irregular para el motor `rest`): terremotovenezuela
// y sosvenezuela2026 (categoría por fila en un mismo endpoint; sosvenezuela2026
// además pagina ~52k personas por offset), ninosvenezuela/hospitalesvenezuela
// (composición de texto etiquetada de Supabase). sismovenezuela migró a `rest`
// (ver presets.ts) y se resuelve por runRestSource, no por este registry.
const REGISTRY: Record<string, SourceConnector> = {
  [terremotovenezuela.id]: terremotovenezuela,
  [ninosvenezuela.id]: ninosvenezuela,
  [hospitalesvenezuela.id]: hospitalesvenezuela,
  [sosvenezuela2026.id]: sosvenezuela2026,
};

export function getConnector(sourceId: string): SourceConnector | undefined {
  return REGISTRY[sourceId];
}

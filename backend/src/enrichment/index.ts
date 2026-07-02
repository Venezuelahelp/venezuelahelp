import { clusterize } from "@/enrichment/cluster";
import { classifyLocated } from "@/enrichment/matchLocated";
import { scoreTrust } from "@/enrichment/trust";
import type {
  EnrichmentConfig,
  ItemEnrichment,
  StoredItem,
} from "@/shared/types";

export type EnrichedItem = StoredItem & ItemEnrichment;

function sk(item: StoredItem): string {
  return `${item.sourceId}#${item.externalId}`;
}

// Calcula, por categoría, las marcas de dedupe y confianza de cada ítem. Función
// pura: no toca DynamoDB ni el reloj y no muta la entrada. `sources` mapea
// sourceId → { trustLevel } para elevar fuentes oficiales.
export function enrichItems(
  items: StoredItem[],
  cfg: EnrichmentConfig,
  sources?: Map<string, { trustLevel?: "official" }>,
): EnrichedItem[] {
  const clusters = clusterize(items, cfg);
  const out: EnrichedItem[] = [];

  for (const [clusterKey, list] of clusters) {
    const sourcesCount = new Set(list.map((i) => i.sourceId)).size;
    // Dentro de un cluster (mismo hecho, según la clave por categoría) el más
    // reciente es el canónico y el resto son duplicados. Las claves por
    // categoría ya evitan agrupar hechos distintos, así que esto marca los
    // duplicados reales (la misma persona/edificio/texto repetido).
    const canonical = [...list].sort((a, b) => {
      const t = b.lastSeenAt.localeCompare(a.lastSeenAt);
      return t !== 0 ? t : sk(a).localeCompare(sk(b));
    })[0];
    const canonicalSk = sk(canonical);

    for (const it of list) {
      const isCanonical = sk(it) === canonicalSk;
      const { trust, trustReasons } = scoreTrust(
        it,
        sourcesCount,
        sources?.get(it.sourceId),
        cfg,
      );
      // Clase canónica del status (solo desaparecidos). classifyLocated es la
      // ÚNICA fuente de verdad de la normalización; "otro" → campo ausente.
      const statusClass =
        it.category === "desaparecidos" ? classifyLocated(it) : "otro";
      out.push({
        ...it,
        clusterKey,
        isCanonical,
        ...(isCanonical ? {} : { dupOf: canonicalSk }),
        sourcesCount,
        trust,
        trustReasons,
        ...(statusClass !== "otro" ? { statusClass } : {}),
      });
    }
  }
  return out;
}

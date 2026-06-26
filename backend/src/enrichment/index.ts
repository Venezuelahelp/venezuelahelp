import { clusterize } from "@/enrichment/cluster";
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
    // Canónico del cluster: el más reciente; desempate por SK ascendente para
    // que la elección sea estable entre corridas.
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
      out.push({
        ...it,
        clusterKey,
        isCanonical,
        ...(isCanonical ? {} : { dupOf: canonicalSk }),
        sourcesCount,
        trust,
        trustReasons,
      });
    }
  }
  return out;
}

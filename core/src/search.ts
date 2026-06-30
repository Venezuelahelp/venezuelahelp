import { keywords } from "./text";
import { inferCategories, CATEGORY_SIGNALS } from "./category";
import { scoreFields, selectWithQuota } from "./rank";
import { filterUsable, matchesZona, haversineKm } from "./filter";
import type { PublicItem, Snapshot } from "./types";

export interface SearchParams {
  q?: string;
  category?: string;
  near?: { lat: number; lng: number };
  radiusKm?: number;
  zona?: string;
  collapseDuplicates?: boolean;
  includeSuspicious?: boolean;
}

interface Scored {
  item: PublicItem;
  score: number;
  target: boolean;
}

// Devuelve los ítems del snapshot que cumplen el filtro, rankeados por keyword.
// Coherente con el bot: infiere categoría, pondera campos, respeta enrichment.
// No pagina ni recorta (eso lo hace cada superficie).
function rankPool(snap: Snapshot, params: SearchParams): Scored[] {
  const hasQuery = typeof params.q === "string" && params.q.trim() !== "";
  const kws = hasQuery ? keywords(params.q!) : [];
  // Query con texto pero todos stopwords → sin términos buscables → sin resultados.
  if (hasQuery && kws.length === 0) return [];

  const targetCats = hasQuery ? inferCategories(params.q!) : new Set<string>();
  // Las palabras que dispararon la categoría no discriminan dentro de ella.
  const signals = [...targetCats].flatMap((c) => CATEGORY_SIGNALS[c] ?? []);
  const rankKws = signals.length
    ? kws.filter(
        (kw) => !signals.some((s) => kw.startsWith(s) || s.startsWith(kw)),
      )
    : kws;

  const out: Scored[] = [];
  for (const [cat, items] of Object.entries(snap.categories)) {
    if (params.category && cat !== params.category) continue;
    const usable = filterUsable(items, {
      collapseDuplicates: params.collapseDuplicates,
      includeSuspicious: params.includeSuspicious,
    });
    for (const item of usable) {
      if (params.zona && !matchesZona(item, params.zona)) continue;
      if (
        params.near &&
        params.radiusKm !== undefined &&
        (!item.ubicacion ||
          haversineKm(params.near, item.ubicacion) > params.radiusKm)
      ) {
        continue;
      }
      const score = rankKws.length ? scoreFields(item, rankKws) : 0;
      const target = targetCats.has(item.category);
      // Sin query (o sin keywords útiles), todo lo que pasó los filtros entra.
      if (kws.length > 0 && score === 0 && !target) continue;
      out.push({ item, score, target });
    }
  }

  out.sort((a, b) => {
    if (targetCats.size > 0 && a.target !== b.target) return a.target ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    const ca = a.item.isCanonical ? 1 : 0;
    const cb = b.item.isCanonical ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (b.item.sourcesCount ?? 0) - (a.item.sourcesCount ?? 0);
  });
  return out;
}

export function searchItems(
  snap: Snapshot,
  params: SearchParams,
): PublicItem[] {
  return rankPool(snap, params).map((s) => s.item);
}

// Capa bot: top-k con cuota por categoría para el RAG.
export function retrieve(
  question: string,
  snap: Snapshot,
  k = 15,
): PublicItem[] {
  if (keywords(question).length === 0) return [];
  const scored = rankPool(snap, { q: question });
  return selectWithQuota(scored, k).map((s) => s.item);
}

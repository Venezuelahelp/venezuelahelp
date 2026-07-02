import type { Item, Snapshot } from "@/types";

/**
 * Parsea el deeplink "#/item/<sourceId>/<externalId>" (componentes
 * URL-encoded). Devuelve null para cualquier otra ruta del hash router de
 * App (#/fuentes, #/interpretes, …) — así la ruta nueva no interfiere con
 * las páginas existentes.
 */
export function parseItemRoute(
  hash: string,
): { sourceId: string; externalId: string } | null {
  const m = /^#\/item\/([^/]+)\/(.+)$/.exec(hash);
  if (!m) return null;
  try {
    return {
      sourceId: decodeURIComponent(m[1]),
      externalId: decodeURIComponent(m[2]),
    };
  } catch {
    // URI malformado (p.ej. "%" suelto): tratar como ruta desconocida.
    return null;
  }
}

/** Hash del deeplink de un ítem (inverso de parseItemRoute). */
export function itemHash(it: Pick<Item, "sourceId" | "externalId">): string {
  return `#/item/${encodeURIComponent(it.sourceId)}/${encodeURIComponent(
    it.externalId,
  )}`;
}

/**
 * Busca un ítem por identidad en TODO el snapshot, incluyendo duplicados no
 * canónicos: un enlace compartido debe resolver aunque el dedup colapse la
 * ficha en la lista.
 */
export function findItem(
  snap: Snapshot,
  sourceId: string,
  externalId: string,
): Item | null {
  for (const items of Object.values(snap.categories)) {
    for (const it of items ?? []) {
      if (it.sourceId === sourceId && it.externalId === externalId) {
        return it;
      }
    }
  }
  return null;
}

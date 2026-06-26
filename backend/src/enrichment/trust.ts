import { normalizeText } from "@/enrichment/cluster";
import type { EnrichmentConfig, StoredItem, TrustLevel } from "@/shared/types";

// Asigna un nivel de confianza explicable a un ítem. La corroboración entre
// fuentes es la señal positiva principal; las reglas de plausibilidad dura
// degradan a "sospechoso" lo que no es creíble.
export function scoreTrust(
  item: StoredItem,
  sourcesCount: number,
  source: { trustLevel?: "official" } | undefined,
  cfg: EnrichmentConfig,
): { trust: TrustLevel; trustReasons: string[] } {
  const reasons: string[] = [];

  // 1) plausibilidad dura → sospechoso
  if (item.ubicacion) {
    const { lat, lng } = item.ubicacion;
    const g = cfg.geocerca;
    if (lat < g.latMin || lat > g.latMax || lng < g.lngMin || lng > g.lngMax) {
      reasons.push("ubicación fuera de la geocerca de Venezuela");
    }
  }
  // Solo es sospechoso por contenido cuando NO hay nada útil: título vacío y, a
  // la vez, texto demasiado corto. Un ítem con título válido pero descripción
  // breve (p. ej. una ficha de desaparecido escueta) es legítimo, no falso.
  const tituloVacio = !item.titulo.trim();
  const textoCorto = (item.texto ?? "").trim().length < cfg.minTextLen;
  if (tituloVacio && textoCorto) {
    reasons.push("sin contenido útil (título y texto vacíos)");
  }
  const hay = normalizeText(`${item.titulo} ${item.texto}`);
  if (cfg.blocklist.some((b) => b && hay.includes(normalizeText(b)))) {
    reasons.push("coincide con la blocklist de spam/troleo");
  }
  if (reasons.length > 0) return { trust: "sospechoso", trustReasons: reasons };

  // 2) fuente oficial
  if (source?.trustLevel === "official") {
    return { trust: "verificado", trustReasons: ["fuente oficial"] };
  }
  // 3) corroboración entre fuentes
  if (sourcesCount >= 2) {
    return {
      trust: "corroborado",
      trustReasons: [`corroborado por ${sourcesCount} fuentes`],
    };
  }
  // 4) default honesto
  return {
    trust: "no_verificado",
    trustReasons: ["reportado por una sola fuente"],
  };
}

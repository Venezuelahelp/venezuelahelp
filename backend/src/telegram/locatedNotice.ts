import { nameKey } from "@/enrichment/matchLocated";
import type { LocatedMatch } from "@/shared/types";

// Índice de matches por clave de nombre (misma normalización ordenada del motor)
// → lookup O(1) al presentar la ficha de un buscado.
export function buildMatchIndex(
  matches: LocatedMatch[],
): Map<string, LocatedMatch> {
  const idx = new Map<string, LocatedMatch>();
  for (const m of matches) idx.set(nameKey(m.nombre), m);
  return idx;
}

// Bloque de aviso para anexar a la respuesta cuando el nombre buscado tiene una
// coincidencia de localización. Nunca afirma; si la localización está respaldada
// por varias fuentes, lo dice. Devuelve null si no hay match.
export function locatedNotice(
  titulo: string,
  index: Map<string, LocatedMatch>,
): string | null {
  const m = index.get(nameKey(titulo));
  if (!m) return null;
  const link = m.located.sourceUrl ? ` (${m.located.sourceUrl})` : "";
  const corrobora =
    m.locatedSourcesCount >= 2
      ? `\n🔁 Corroborado por ${m.locatedSourcesCount} fuentes.`
      : "";
  return (
    `⚠️ Coincidencia automática (no confirmada): esta persona fue ` +
    `reportada como *localizada*${link}.${corrobora}\n` +
    `Verifica directamente con la fuente antes de sacar conclusiones.`
  );
}

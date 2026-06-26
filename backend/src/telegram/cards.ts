import { haversineKm, type LatLng } from "@/telegram/geo";
import type { InlineKeyboardButton, PublicItem } from "@/telegram/types";

const TRUST_BADGE: Record<string, string> = {
  verificado: "✅ verificado",
  corroborado: "🟢 corroborado",
  no_verificado: "⚪ sin verificar",
};

function excerpt(s: string, n = 160): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function mapsUrl(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}

export interface RenderedList {
  text: string;
  buttons: InlineKeyboardButton[][];
}

export function renderList(
  items: PublicItem[],
  userLoc?: LatLng,
): RenderedList {
  const blocks: string[] = [];
  const buttons: InlineKeyboardButton[][] = [];
  items.forEach((it, i) => {
    const badge = TRUST_BADGE[it.trust ?? "no_verificado"] ?? "";
    const parts = [`${i + 1}. ${it.titulo}${badge ? `  ·  ${badge}` : ""}`];
    const ex = excerpt(it.texto);
    if (ex) parts.push(ex);
    if (it.ubicacion) {
      if (it.ubicacion.nombre) parts.push(`📍 ${it.ubicacion.nombre}`);
      if (userLoc) {
        const km = haversineKm(userLoc, it.ubicacion);
        parts.push(`📏 a ~${km < 1 ? "<1" : Math.round(km)} km`);
      }
      buttons.push([
        {
          text: `📍 Cómo llegar — ${excerpt(it.titulo, 24)}`,
          url: mapsUrl(it.ubicacion),
        },
      ]);
    }
    blocks.push(parts.join("\n"));
  });
  return { text: blocks.join("\n\n"), buttons };
}

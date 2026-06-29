import { fetchJson } from "@/connectors/http";
import {
  geo,
  imageUrl,
  truncate,
  type SourceConnector,
} from "@/connectors/types";
import { logger } from "@/shared/logger";
import type { Category, NormalizedItem } from "@/shared/types";

// El backend se movió de terremotovenezuela.app/api/* (hoy 404, sirve el SPA) a
// un subdominio dedicado api.terremotovenezuela.app (mismo shape: {reports},
// {markers}). El cliente usa un helper apiFetch contra esta base; descubierto en
// los chunks del bundle (NEXT base-URL). La home pública sigue siendo
// terremotovenezuela.app (Source.url / snapshot.sources). <!-- /aprende 2026-06-29 -->
const BASE = "https://api.terremotovenezuela.app";
const ID = "terremotovenezuela";

const TYPE_TO_CATEGORY: Record<string, Category | undefined> = {
  critical: "reportes",
  nopower: "reportes",
  supplies: "acopios",
  shelter: "acopios",
  building: "edificios",
  missing: undefined, // pin liviano: se ignora (cubierto por /api/missing/map)
};

async function safe(
  label: string,
  fn: () => Promise<NormalizedItem[]>,
): Promise<NormalizedItem[]> {
  try {
    return await fn();
  } catch (err) {
    logger.warn("terremotovenezuela endpoint failed", {
      label,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function reports(): Promise<NormalizedItem[]> {
  const res = await fetchJson<{ reports: Array<Record<string, any>> }>(
    `${BASE}/api/reports`,
  );
  const out: NormalizedItem[] = [];
  for (const r of res.reports ?? []) {
    const category = TYPE_TO_CATEGORY[String(r.type)];
    if (!category) continue;
    out.push({
      category,
      sourceId: ID,
      externalId: String(r.id),
      titulo: truncate(String(r.place ?? r.type ?? "Reporte"), 120),
      texto: truncate([r.affected, r.needs].filter(Boolean).join(" · ")),
      ubicacion: geo(r.lat, r.lng, r.place),
      status: String(r.type),
      imageUrl: imageUrl(BASE, r.photoUrl),
      raw: r,
    });
  }
  return out;
}

async function desaparecidos(): Promise<NormalizedItem[]> {
  const res = await fetchJson<{ markers: Array<Record<string, any>> }>(
    `${BASE}/api/missing/map`,
  );
  return (res.markers ?? []).map((m) => ({
    category: "desaparecidos" as Category,
    sourceId: ID,
    externalId: String(m.id),
    titulo: truncate(String(m.name ?? "Desaparecido"), 120),
    texto: truncate(
      [m.age ? `Edad ${m.age}` : "", m.lastSeen].filter(Boolean).join(" · "),
    ),
    ubicacion: geo(m.lat, m.lng, m.lastSeen),
    imageUrl: imageUrl(BASE, m.photoUrl),
    raw: m,
  }));
}

export const terremotovenezuela: SourceConnector = {
  id: ID,
  async fetchItems() {
    const groups = await Promise.all([
      safe("reports", reports),
      safe("desaparecidos", desaparecidos),
    ]);
    return groups.flat();
  },
};

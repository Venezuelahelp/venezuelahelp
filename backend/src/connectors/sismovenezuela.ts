import { fetchJson } from "@/connectors/http";
import { geo, truncate, type SourceConnector } from "@/connectors/types";
import type { NormalizedItem } from "@/shared/types";

const BASE = "https://www.sismovenezuela.com";
const ID = "sismovenezuela";

type GeoFeature = {
  properties: Record<string, unknown>;
  geometry?: { coordinates?: [number, number] };
};

async function safe(
  label: string,
  fn: () => Promise<NormalizedItem[]>,
): Promise<NormalizedItem[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

async function reportes(): Promise<NormalizedItem[]> {
  const rows = await fetchJson<Array<Record<string, any>>>(
    `${BASE}/api/reports/feed?limit=200`,
  );
  return rows.map((r) => ({
    category: "reportes",
    sourceId: ID,
    externalId: String(r.id),
    titulo: truncate(r.location_name || r.author || "Reporte", 120),
    texto: truncate(r.text_content),
    ubicacion: geo(r.lat, r.lng, r.location_name),
    status: r.damage_level ? String(r.damage_level) : undefined,
    raw: r,
  }));
}

async function acopios(): Promise<NormalizedItem[]> {
  const rows = await fetchJson<Array<Record<string, any>>>(
    `${BASE}/api/relief-centers`,
  );
  return rows.map((r) => ({
    category: "acopios",
    sourceId: ID,
    externalId: String(r.id),
    titulo: truncate(r.name, 120),
    texto: truncate(
      [r.address, r.state, r.accepted_items].filter(Boolean).join(" · "),
    ),
    ubicacion: geo(r.lat, r.lng, r.name),
    raw: r,
  }));
}

async function edificios(): Promise<NormalizedItem[]> {
  const fc = await fetchJson<{ features: GeoFeature[] }>(
    `${BASE}/api/building-damage`,
  );
  return (fc.features ?? []).map((f) => {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    return {
      category: "edificios",
      sourceId: ID,
      externalId: String(p.id),
      titulo: truncate(String(p.place ?? "Edificio dañado"), 120),
      texto: truncate([p.damage_type, p.needs].filter(Boolean).join(" · ")),
      ubicacion: c ? geo(c[1], c[0], p.place as string) : undefined,
      status: p.affected ? String(p.affected) : undefined,
      raw: p,
    };
  });
}

async function solicitudes(): Promise<NormalizedItem[]> {
  const res = await fetchJson<{ data: Array<Record<string, any>> }>(
    `${BASE}/api/needs`,
  );
  return (res.data ?? []).map((r) => ({
    category: "solicitudes",
    sourceId: ID,
    externalId: String(r.id),
    titulo: truncate(r.title, 120),
    texto: truncate(
      [r.description, r.items_needed].filter(Boolean).join(" · "),
    ),
    ubicacion: geo(r.lat, r.lng, r.location_name),
    status: r.priority ? String(r.priority) : undefined,
    raw: r,
  }));
}

async function desaparecidos(): Promise<NormalizedItem[]> {
  const fc = await fetchJson<{ features: GeoFeature[] }>(
    `${BASE}/api/missing-persons/external`,
  );
  return (fc.features ?? []).map((f) => {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    return {
      category: "desaparecidos",
      sourceId: ID,
      externalId: String(p.id),
      titulo: truncate(String(p.nombre ?? "Desaparecido"), 120),
      texto: truncate(
        [p.edad ? `Edad ${p.edad}` : "", p.descripcion, p.ubicacion]
          .filter(Boolean)
          .join(" · "),
      ),
      ubicacion: c ? geo(c[1], c[0], p.ubicacion as string) : undefined,
      status: p.estado ? String(p.estado) : undefined,
      raw: p,
    };
  });
}

export const sismovenezuela: SourceConnector = {
  id: ID,
  async fetchItems() {
    const groups = await Promise.all([
      safe("reportes", reportes),
      safe("acopios", acopios),
      safe("edificios", edificios),
      safe("solicitudes", solicitudes),
      safe("desaparecidos", desaparecidos),
    ]);
    return groups.flat();
  },
};

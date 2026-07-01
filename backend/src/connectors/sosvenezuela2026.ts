import { fetchJson } from "@/connectors/http";
import {
  geo,
  imageUrl,
  truncate,
  type SourceConnector,
} from "@/connectors/types";
import { logger } from "@/shared/logger";
import type { Category, NormalizedItem } from "@/shared/types";

// Agregador Next.js con API JSON propia y ABIERTA (HTTP 200, sin apikey, sin
// reCAPTCHA, sin Cloudflare). Dos endpoints útiles: /api/reports (el "mapa en
// vivo", categoría POR FILA en el campo `category`) y /api/persons/list (~52k
// desaparecidos/localizados, paginado por offset, sin coordenadas). Es un
// ESPEJO: los desaparecidos vienen de desaparecidosvenezuela.com y los reportes
// citan terremotovenezuela.com → el dedup por nombre/geocelda colapsa los
// solapes con otras fuentes y suma corroboración. Descubierto 2026-07-01.
const BASE = "https://sosvenezuela2026.com";
const ID = "sosvenezuela2026";

// /api/reports: el campo `category` (8 valores) mapea a nuestras categorías.
const REPORT_CATEGORY: Record<string, Category | undefined> = {
  damaged_building: "edificios",
  collapsed_building: "edificios",
  aid_point: "acopios",
  shelter: "acopios",
  water_point: "acopios",
  trapped_people: "reportes",
  gas_leak: "reportes",
  medical_need: "solicitudes",
};

// /api/persons: status → convención de matchLocated (buscado↔localizado). El
// crudo (seeking_info/found_alive) NO está en sus sets y daría "otro" → los
// localizados quedarían fuera del cruce de posibles localizaciones.
const PERSON_STATUS: Record<string, string> = {
  seeking_info: "buscando",
  found_alive: "localizado",
};

const PAGE_SIZE = 100;
// Cota de seguridad muy por encima de los ~52k reales para evitar un bucle
// infinito si la API dejara de menguar.
const MAX_PERSONS = 80000;
// Pausa entre páginas. La API rate-limita con 429 alrededor de ~150 req/min, y
// son ~525 páginas de data-ESPEJO (desaparecidosvenezuela.com, ya cubierta en
// parte por otras fuentes). Estrategia BEST-EFFORT: ante el 429 paramos y
// devolvemos lo acumulado (los ~más recientes) en vez de perderlo o gastar ~6
// min por scrape persiguiendo cobertura total de datos duplicados. Ver
// lesson_rest-throttle-rate-limit.
const THROTTLE_MS = 200;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function safe(
  label: string,
  fn: () => Promise<NormalizedItem[]>,
): Promise<NormalizedItem[]> {
  try {
    return await fn();
  } catch (err) {
    logger.warn("sosvenezuela2026 endpoint failed", {
      label,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reports(): Promise<NormalizedItem[]> {
  const rows = await fetchJson<Array<Record<string, any>>>(
    `${BASE}/api/reports`,
  );
  const out: NormalizedItem[] = [];
  for (const r of rows ?? []) {
    const category = REPORT_CATEGORY[String(r.category)];
    if (!category) continue; // tipo no mapeado → se ignora
    out.push({
      category,
      sourceId: ID,
      externalId: String(r.id),
      titulo: truncate(String(r.title ?? "Reporte"), 120),
      texto: truncate(
        [r.description, r.municipio, r.parroquia].filter(Boolean).join(" · "),
      ),
      ubicacion: geo(r.lat_pub, r.lng_pub, r.parroquia ?? r.municipio),
      status: String(r.category),
      imageUrl: imageUrl(BASE, r.image_url),
      ...(typeof r.source_url === "string" && r.source_url
        ? { sourceUrl: r.source_url }
        : {}),
      raw: r,
    });
  }
  return out;
}

async function persons(): Promise<NormalizedItem[]> {
  const out: NormalizedItem[] = [];
  for (let offset = 0; offset < MAX_PERSONS; offset += PAGE_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: Array<Record<string, any>>;
    try {
      rows = await fetchJson<Array<Record<string, any>>>(
        `${BASE}/api/persons/list?offset=${offset}&limit=${PAGE_SIZE}`,
      );
    } catch (err) {
      // Best-effort: la API corta con 429 (~150 req/min). Devolvemos lo
      // acumulado en vez de descartar miles de ítems ya traídos.
      logger.warn("sosvenezuela2026 persons: parada anticipada (best-effort)", {
        offset,
        got: out.length,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
    if (!rows?.length) break;
    for (const p of rows) {
      out.push({
        category: "desaparecidos",
        sourceId: ID,
        externalId: String(p.id),
        titulo: truncate(String(p.display_name ?? "Desaparecido"), 120),
        texto: truncate(
          [p.parroquia, p.hospital_name, p.municipio]
            .filter(Boolean)
            .join(" · "),
        ),
        status: PERSON_STATUS[String(p.status)] ?? "",
        imageUrl: imageUrl(BASE, p.photo_path),
        raw: p,
      });
    }
    if (rows.length < PAGE_SIZE) break; // última página
    await delay(THROTTLE_MS);
  }
  return out;
}

export const sosvenezuela2026: SourceConnector = {
  id: ID,
  async fetchItems() {
    const groups = await Promise.all([
      safe("reports", reports),
      safe("persons", persons),
    ]);
    return groups.flat();
  },
};

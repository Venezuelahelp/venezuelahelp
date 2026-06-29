import { geo, imageUrl, truncate } from "@/connectors/types";
import { logger } from "@/shared/logger";
import type { EndpointStat, NormalizedItem } from "@/shared/types";
import type { RestConfig, RestEndpoint } from "@/connectors/restConfig";

// dot-path tolerante: "a.b.0.c" navega objetos y arrays. Devuelve undefined si
// algún tramo falta. path vacío devuelve el objeto entero.
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// Coacciona un valor a string no vacío, o undefined (los números como
// damage_level/affected llegan como number y deben viajar como texto).
function stringOrUndefined(v: unknown): string | undefined {
  if (v == null || String(v).trim() === "") return undefined;
  return String(v);
}

// Sustituye "{campo}" por el dot-path resuelto sobre `obj` (vacío si falta).
export function fillTemplate(tpl: string, obj: unknown): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, k) => {
    const v = getPath(obj, k);
    return v == null ? "" : String(v);
  });
}

// Mapea una fila JSON a NormalizedItem según el fieldMap del endpoint. Devuelve
// null si falta el externalId (no se puede dar identidad estable → se descarta).
// `sourceId` lo fija runRestSource (aquí queda vacío).
export function mapRow(
  row: unknown,
  ep: RestEndpoint,
  base: string,
): NormalizedItem | null {
  const fm = ep.fieldMap;
  const src =
    ep.shape === "geojson"
      ? ((row as { properties?: unknown })?.properties ?? {})
      : row;
  const coords =
    ep.shape === "geojson"
      ? ((row as { geometry?: { coordinates?: [number, number] } })?.geometry
          ?.coordinates ?? undefined)
      : undefined;

  const externalId = getPath(src, fm.externalId);
  if (externalId == null || String(externalId).trim() === "") return null;

  // titulo admite una cadena de fallback: se toma el primer path no vacío.
  const tituloPaths = Array.isArray(fm.titulo) ? fm.titulo : [fm.titulo];
  let tituloRaw: unknown;
  for (const p of tituloPaths) {
    const v = getPath(src, p);
    if (v != null && String(v).trim() !== "") {
      tituloRaw = v;
      break;
    }
  }
  const titulo = truncate(
    tituloRaw != null ? String(tituloRaw) : "(sin título)",
    120,
  );

  const texto = truncate(
    (fm.texto ?? [])
      .map((p) => getPath(src, p))
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v))
      .join(" · "),
  );

  const lat = coords
    ? coords[1]
    : fm.lat
      ? (getPath(src, fm.lat) as number | undefined)
      : undefined;
  const lng = coords
    ? coords[0]
    : fm.lng
      ? (getPath(src, fm.lng) as number | undefined)
      : undefined;
  const nombre = tituloRaw != null ? String(tituloRaw) : undefined;

  const sourceUrlRaw =
    (fm.sourceUrl
      ? (getPath(src, fm.sourceUrl) as string | undefined)
      : undefined) ??
    (fm.sourceUrlTemplate
      ? fillTemplate(fm.sourceUrlTemplate, src)
      : undefined);

  return {
    category: ep.category,
    sourceId: "",
    externalId: String(externalId),
    titulo,
    texto,
    ubicacion: geo(
      typeof lat === "number" ? lat : undefined,
      typeof lng === "number" ? lng : undefined,
      nombre,
    ),
    status: fm.status ? stringOrUndefined(getPath(src, fm.status)) : undefined,
    imageUrl: fm.imageUrl
      ? imageUrl(base, getPath(src, fm.imageUrl) as string | null | undefined)
      : undefined,
    sourceUrl: imageUrl(base, sourceUrlRaw),
    raw: row,
  };
}

interface RestDeps {
  fetchJson: <T>(
    url: string,
    timeoutMs?: number,
    headers?: Record<string, string>,
  ) => Promise<T>;
}

// Corre todos los endpoints de una RestConfig. Un endpoint que falla queda
// registrado en endpointStats (fetched 0 + error) y NO impide los demás.
export async function runRestSource(
  sourceId: string,
  cfg: RestConfig,
  deps: RestDeps,
): Promise<{ items: NormalizedItem[]; endpointStats: EndpointStat[] }> {
  const items: NormalizedItem[] = [];
  const endpointStats: EndpointStat[] = [];

  for (const ep of cfg.endpoints) {
    try {
      const json = await deps.fetchJson<unknown>(ep.url, 15000, ep.headers);
      const arr = getPath(json, ep.itemsPath ?? "");
      if (!Array.isArray(arr)) {
        endpointStats.push({
          label: ep.label,
          fetched: 0,
          error: "respuesta no es un array (¿HTML/SPA?)",
        });
        continue;
      }
      let n = 0;
      for (const row of arr) {
        const mapped = mapRow(row, ep, cfg.base);
        if (!mapped) continue;
        mapped.sourceId = sourceId;
        items.push(mapped);
        n += 1;
      }
      endpointStats.push({ label: ep.label, fetched: n });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("rest endpoint failed", {
        sourceId,
        label: ep.label,
        error: msg,
      });
      endpointStats.push({ label: ep.label, fetched: 0, error: msg });
    }
  }

  return { items, endpointStats };
}

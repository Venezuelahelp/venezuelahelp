import { describe, it, expect, vi } from "vitest";
import reportsFeed from "./fixtures/sismo_reports_feed.json";
import reliefCenters from "./fixtures/sismo_relief_centers.json";
import buildingDamage from "./fixtures/sismo_building_damage.json";
import needs from "./fixtures/sismo_needs.json";
import { PRESETS } from "@/connectors/presets";
import { runRestSource } from "@/connectors/restEngine";

// fetchJson mockeado: mapea por pathname del endpoint al fixture.
function fetchByPath(map: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    const key = Object.keys(map).find((p) => path.startsWith(p));
    if (!key) throw new Error(`GET ${url} failed: 404`);
    return map[key];
  }) as never;
}

const FIXTURES = {
  "/api/reports/feed": reportsFeed,
  "/api/relief-centers": reliefCenters,
  "/api/building-damage": buildingDamage,
  "/api/needs": needs,
};

describe("preset sismovenezuela", () => {
  it("normaliza las 4 categorías con sourceId fijado", async () => {
    const { items } = await runRestSource(
      "sismovenezuela",
      PRESETS.sismovenezuela,
      { fetchJson: fetchByPath(FIXTURES) },
    );
    const cats = new Set(items.map((i) => i.category));
    expect(cats).toEqual(
      new Set(["reportes", "acopios", "edificios", "solicitudes"]),
    );
    expect(items.every((i) => i.sourceId === "sismovenezuela")).toBe(true);
    expect(items.every((i) => i.externalId.length > 0)).toBe(true);
  });

  it("reportes: source_url → sourceUrl, media_urls[0] → imageUrl", async () => {
    const { items } = await runRestSource(
      "sismovenezuela",
      PRESETS.sismovenezuela,
      { fetchJson: fetchByPath(FIXTURES) },
    );
    const r0 = items.find(
      (i) => i.category === "reportes" && i.externalId === reportsFeed[0].id,
    );
    expect(r0?.sourceUrl).toBe(reportsFeed[0].source_url);
    expect(r0?.imageUrl).toBe(reportsFeed[0].media_urls?.[0]);
    // segundo reporte: media_urls null → sin imageUrl
    const r1 = items.find(
      (i) => i.category === "reportes" && i.externalId === reportsFeed[1].id,
    );
    expect(r1?.imageUrl).toBeUndefined();
  });

  it("edificios (geojson): coords [lng,lat] → ubicacion, source → sourceUrl", async () => {
    const { items } = await runRestSource(
      "sismovenezuela",
      PRESETS.sismovenezuela,
      { fetchJson: fetchByPath(FIXTURES) },
    );
    const f = buildingDamage.features[0];
    const edi = items.find(
      (i) => i.category === "edificios" && i.externalId === f.properties.id,
    );
    expect(edi?.ubicacion?.lat).toBe(f.geometry.coordinates[1]);
    expect(edi?.ubicacion?.lng).toBe(f.geometry.coordinates[0]);
    expect(edi?.ubicacion?.lat).not.toBe(edi?.ubicacion?.lng);
    expect(edi?.sourceUrl).toBe(f.properties.source);
    // segundo edificio trae photo_url → imageUrl
    const f1 = buildingDamage.features[1];
    const edi1 = items.find(
      (i) => i.category === "edificios" && i.externalId === f1.properties.id,
    );
    expect(edi1?.imageUrl).toBe(f1.properties.photo_url);
  });

  it("acopios y solicitudes también capturan source_url", async () => {
    const { items } = await runRestSource(
      "sismovenezuela",
      PRESETS.sismovenezuela,
      { fetchJson: fetchByPath(FIXTURES) },
    );
    const acopio = items.find((i) => i.category === "acopios");
    expect(acopio?.sourceUrl).toBe(reliefCenters[0].source_url);
    const sol = items.find((i) => i.category === "solicitudes");
    expect(sol?.sourceUrl).toBe(needs.data[0].source_url);
  });

  it("aísla un endpoint caído (los demás siguen + endpointStats)", async () => {
    const { items, endpointStats } = await runRestSource(
      "sismovenezuela",
      PRESETS.sismovenezuela,
      {
        fetchJson: fetchByPath({
          "/api/relief-centers": reliefCenters,
          "/api/building-damage": buildingDamage,
          "/api/needs": needs,
          // /api/reports/feed ausente → 404 → error en ese endpoint
        }),
      },
    );
    expect(items.some((i) => i.category === "acopios")).toBe(true);
    expect(items.some((i) => i.category === "reportes")).toBe(false);
    const reportesStat = endpointStats.find((s) => s.label === "reportes");
    expect(reportesStat?.error).toBeDefined();
    expect(reportesStat?.fetched).toBe(0);
  });
});

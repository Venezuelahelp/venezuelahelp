import { describe, it, expect, vi, beforeEach } from "vitest";
import reportsFeed from "./fixtures/sismo_reports_feed.json";
import reliefCenters from "./fixtures/sismo_relief_centers.json";
import buildingDamage from "./fixtures/sismo_building_damage.json";
import needs from "./fixtures/sismo_needs.json";
import { sismovenezuela } from "@/connectors/sismovenezuela";

function mockByPath(map: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const key = Object.keys(map).find((p) => path.startsWith(p));
      if (!key) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(map[key]), { status: 200 });
    }),
  );
}

beforeEach(() => {
  mockByPath({
    "/api/reports/feed": reportsFeed,
    "/api/relief-centers": reliefCenters,
    "/api/building-damage": buildingDamage,
    "/api/needs": needs,
  });
});

describe("sismovenezuela connector", () => {
  it("normalizes items across all categories with sourceId set", async () => {
    const items = await sismovenezuela.fetchItems();
    const cats = new Set(items.map((i) => i.category));
    expect(cats).toEqual(
      new Set(["reportes", "acopios", "edificios", "solicitudes"]),
    );
    // desaparecidos NO se ingieren desde sismovenezuela (decisión de costo)
    expect(cats.has("desaparecidos")).toBe(false);
    expect(items.every((i) => i.sourceId === "sismovenezuela")).toBe(true);
    expect(items.every((i) => i.externalId && i.externalId.length > 0)).toBe(
      true,
    );
  });

  it("maps GeoJSON building-damage coordinates to ubicacion (lat=coords[1], lng=coords[0])", async () => {
    const items = await sismovenezuela.fetchItems();
    const f = buildingDamage.features[0];
    const edi = items.find(
      (i) =>
        i.category === "edificios" && i.externalId === String(f.properties.id),
    );
    expect(edi?.ubicacion?.lat).toBe(f.geometry.coordinates[1]);
    expect(edi?.ubicacion?.lng).toBe(f.geometry.coordinates[0]);
    // guard against a lat/lng swap when the two differ
    expect(edi?.ubicacion?.lat).not.toBe(edi?.ubicacion?.lng);
  });

  it("maps the first media_urls entry to imageUrl, omitting it when null", async () => {
    const items = await sismovenezuela.fetchItems();
    const withMedia = items.find(
      (i) =>
        i.category === "reportes" && i.externalId === String(reportsFeed[0].id),
    );
    expect(withMedia?.imageUrl).toBe(reportsFeed[0].media_urls?.[0]);
    // segundo reporte: media_urls null → sin imageUrl
    const noMedia = items.find(
      (i) =>
        i.category === "reportes" && i.externalId === String(reportsFeed[1].id),
    );
    expect(noMedia?.imageUrl).toBeUndefined();
  });

  it("maps building-damage photo_url to imageUrl when present", async () => {
    const items = await sismovenezuela.fetchItems();
    const f = buildingDamage.features[1];
    const edi = items.find(
      (i) =>
        i.category === "edificios" && i.externalId === String(f.properties.id),
    );
    expect(edi?.imageUrl).toBe(f.properties.photo_url);
  });

  it("isolates a failing endpoint (still returns items from the others)", async () => {
    mockByPath({
      "/api/relief-centers": reliefCenters,
      "/api/building-damage": buildingDamage,
      "/api/needs": needs,
      // /api/reports/feed ausente => 404 => se omite
    });
    const items = await sismovenezuela.fetchItems();
    expect(items.some((i) => i.category === "acopios")).toBe(true);
    expect(items.some((i) => i.category === "reportes")).toBe(false);
  });
});

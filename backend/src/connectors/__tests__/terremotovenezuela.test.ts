import { describe, it, expect, vi, beforeEach } from "vitest";
import reports from "./fixtures/tv_reports.json";
import missingMap from "./fixtures/tv_missing_map.json";
import { terremotovenezuela } from "@/connectors/terremotovenezuela";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.startsWith("/api/reports"))
        return new Response(JSON.stringify(reports), { status: 200 });
      if (path.startsWith("/api/missing/map"))
        return new Response(JSON.stringify(missingMap), { status: 200 });
      return new Response("404", { status: 404 });
    }),
  );
});

describe("terremotovenezuela connector", () => {
  it("maps report 'type' to categories and ignores 'missing' pins", async () => {
    const items = await terremotovenezuela.fetchItems();
    // 'missing' type from /api/reports must NOT appear as a report-derived item
    const fromReports = items.filter(
      (i) =>
        i.sourceId === "terremotovenezuela" && i.raw && (i.raw as any).type,
    );
    expect(fromReports.some((i) => (i.raw as any).type === "missing")).toBe(
      false,
    );
    const cats = new Set(fromReports.map((i) => i.category));
    // critical/nopower→reportes, supplies/shelter→acopios, building→edificios
    expect(
      [...cats].every((c) => ["reportes", "acopios", "edificios"].includes(c)),
    ).toBe(true);
  });

  it("resolves report photoUrl to an absolute imageUrl, and omits it when null", async () => {
    const items = await terremotovenezuela.fetchItems();
    const withPhoto = items.find(
      (i) => i.externalId === "b7651e6d-747e-4b52-bc6f-b916a8a6dcab",
    );
    expect(withPhoto?.imageUrl).toBe(
      "https://terremotovenezuela.app/api/reports/b7651e6d-747e-4b52-bc6f-b916a8a6dcab/photo",
    );
    // report 476b... has photoUrl: null → no imageUrl field
    const noPhoto = items.find(
      (i) => i.externalId === "476b17c6-9fea-4ae0-a59b-494e88955894",
    );
    expect(noPhoto?.imageUrl).toBeUndefined();
  });

  it("resolves desaparecidos photoUrl to an absolute imageUrl", async () => {
    const items = await terremotovenezuela.fetchItems();
    const desap = items.find(
      (i) => i.externalId === "e55b1b4b-13bc-4344-8715-1b888e8a539b",
    );
    expect(desap?.imageUrl).toBe(
      "https://terremotovenezuela.app/api/missing/e55b1b4b-13bc-4344-8715-1b888e8a539b/photo",
    );
  });

  it("maps /api/missing/map markers to geolocated desaparecidos", async () => {
    const items = await terremotovenezuela.fetchItems();
    const desap = items.filter((i) => i.category === "desaparecidos");
    expect(desap.length).toBeGreaterThan(0);
    expect(desap.every((i) => i.ubicacion?.lat && i.ubicacion?.lng)).toBe(true);
    // assert exact lat/lng values from fixture to catch a lat/lng swap
    const marker = missingMap.markers[0];
    const found = desap.find((i) => i.externalId === String(marker.id));
    expect(found?.ubicacion?.lat).toBe(marker.lat);
    expect(found?.ubicacion?.lng).toBe(marker.lng);
    // guard against a lat/lng swap when the two differ
    expect(found?.ubicacion?.lat).not.toBe(found?.ubicacion?.lng);
  });
});

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

  it("maps /api/missing/map markers to geolocated desaparecidos", async () => {
    const items = await terremotovenezuela.fetchItems();
    const desap = items.filter((i) => i.category === "desaparecidos");
    expect(desap.length).toBeGreaterThan(0);
    expect(desap.every((i) => i.ubicacion?.lat && i.ubicacion?.lng)).toBe(true);
  });
});

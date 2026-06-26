// backend/src/telegram/__tests__/geo.test.ts
import { describe, it, expect } from "vitest";
import { haversineKm, sortByDistance } from "@/telegram/geo";

describe("haversineKm", () => {
  it("computa una distancia conocida (Caracas–Maracay ~70-90 km)", () => {
    const caracas = { lat: 10.4806, lng: -66.9036 };
    const maracay = { lat: 10.2469, lng: -67.5958 };
    const d = haversineKm(caracas, maracay);
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(90);
  });

  it("distancia a sí mismo es 0", () => {
    const p = { lat: 10, lng: -66 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });
});

describe("sortByDistance", () => {
  it("ordena por cercanía y deja los sin-geo al final", () => {
    const from = { lat: 10, lng: -66 };
    const items = [
      { id: "lejos", ubicacion: { lat: 11, lng: -66 } },
      { id: "sin" },
      { id: "cerca", ubicacion: { lat: 10.05, lng: -66 } },
    ];
    const out = sortByDistance(items, from);
    expect(out.map((i) => i.id)).toEqual(["cerca", "lejos", "sin"]);
  });
});

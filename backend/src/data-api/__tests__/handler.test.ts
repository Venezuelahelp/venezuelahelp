import { describe, it, expect } from "vitest";
import { handler } from "@/data-api/handler";
import type { DataSnapshot } from "@/data-api/snapshot";
import type { PublicItem } from "@/telegram/types";

function item(p: Partial<PublicItem> & { externalId: string }): PublicItem {
  return { category: "desaparecidos", sourceId: "s1", titulo: "", texto: "", ...p };
}

const snap: DataSnapshot = {
  generatedAt: "2026-06-29T00:00:00.000Z",
  sources: { s1: { nombre: "Fuente 1", url: "https://s1" } },
  categories: {
    desaparecidos: [
      item({ externalId: "1", titulo: "Ana" }),
      item({ externalId: "2", titulo: "Beto" }),
    ],
    reportes: [item({ externalId: "3", category: "reportes" })],
  },
};

function ev(rawPath: string, qs?: Record<string, string>) {
  return {
    requestContext: { http: { method: "GET" } },
    rawPath,
    queryStringParameters: qs,
  };
}

const deps = { loadSnapshot: async () => snap };

describe("data-api handler", () => {
  it("GET /v1/items returns items with CORS and content-type json", async () => {
    const res = await handler(ev("/v1/items"), deps);
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    const body = JSON.parse(res.body);
    expect(body.total).toBe(3);
  });

  it("GET /v1/items?category= filters", async () => {
    const res = await handler(ev("/v1/items", { category: "reportes" }), deps);
    const body = JSON.parse(res.body);
    expect(body.items.map((i: PublicItem) => i.externalId)).toEqual(["3"]);
  });

  it("GET /v1/items?q= filters by keyword", async () => {
    const res = await handler(ev("/v1/items", { q: "ana" }), deps);
    const body = JSON.parse(res.body);
    expect(body.items.map((i: PublicItem) => i.externalId)).toEqual(["1"]);
  });

  it("GET /v1/categories returns counts", async () => {
    const res = await handler(ev("/v1/categories"), deps);
    const body = JSON.parse(res.body);
    expect(body.counts).toMatchObject({ desaparecidos: 2, reportes: 1 });
  });

  it("GET /v1/sources returns the sources map", async () => {
    const res = await handler(ev("/v1/sources"), deps);
    const body = JSON.parse(res.body);
    expect(body.s1.nombre).toBe("Fuente 1");
  });

  it("GET /v1/meta returns generatedAt", async () => {
    const res = await handler(ev("/v1/meta"), deps);
    expect(JSON.parse(res.body).generatedAt).toBe(snap.generatedAt);
  });

  it("OPTIONS returns 204 with CORS (preflight)", async () => {
    const res = await handler(
      { ...ev("/v1/items"), requestContext: { http: { method: "OPTIONS" } } },
      deps,
    );
    expect(res.statusCode).toBe(204);
  });

  it("unknown path returns 404", async () => {
    const res = await handler(ev("/v1/nope"), deps);
    expect(res.statusCode).toBe(404);
  });

  it("returns 502 if the snapshot cannot be loaded", async () => {
    const res = await handler(ev("/v1/items"), {
      loadSnapshot: async () => {
        throw new Error("down");
      },
    });
    expect(res.statusCode).toBe(502);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { sosvenezuela2026 } from "@/connectors/sosvenezuela2026";

const REPORTS = [
  {
    id: "r1",
    category: "damaged_building",
    title: "Edificio con daños",
    description: "Grietas visibles",
    lat_pub: 10.6,
    lng_pub: -66.9,
    municipio: "Vargas",
    parroquia: "Caraballeda",
    image_url: "https://cdn.example.com/a.jpg",
    source_url: "https://terremotovenezuela.com/",
  },
  {
    id: "r2",
    category: "aid_point",
    title: "Punto de acopio",
    description: null,
    lat_pub: 10.5,
    lng_pub: -66.8,
    municipio: "Vargas",
    parroquia: "Macuto",
    image_url: null,
    source_url: null,
  },
  {
    id: "r3",
    category: "medical_need",
    title: "Necesita insulina",
    lat_pub: 10.4,
    lng_pub: -66.7,
    image_url: null,
    source_url: null,
  },
  {
    // categoría no mapeada → se ignora
    id: "r4",
    category: "unknown_type",
    title: "X",
    lat_pub: 10.1,
    lng_pub: -66.1,
  },
];

const PERSONS = [
  {
    id: "p1",
    status: "seeking_info",
    display_name: "Omar Zambrano",
    parroquia: "La Guaira · Catia La Mar",
    hospital_name: null,
    photo_path: "https://www.desaparecidosvenezuela.com/api/personas/x/foto",
  },
  {
    id: "p2",
    status: "found_alive",
    display_name: "María Pérez",
    parroquia: "Vargas",
    hospital_name: "Hospital de la Guaira",
    photo_path: null,
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/reports")) {
        return new Response(JSON.stringify(REPORTS), { status: 200 });
      }
      if (url.includes("/api/persons/list")) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        // Primera página trae datos; la siguiente (offset>=length) va vacía y
        // corta la paginación.
        return new Response(JSON.stringify(offset === 0 ? PERSONS : []), {
          status: 200,
        });
      }
      return new Response("[]", { status: 200 });
    }),
  );
});

describe("sosvenezuela2026 connector", () => {
  it("maps /api/reports categories per-row and skips unknown types", async () => {
    const items = await sosvenezuela2026.fetchItems();
    const byId = Object.fromEntries(items.map((i) => [i.externalId, i]));
    expect(byId.r1.category).toBe("edificios");
    expect(byId.r2.category).toBe("acopios");
    expect(byId.r3.category).toBe("solicitudes");
    expect(byId.r4).toBeUndefined(); // unknown_type ignorado
  });

  it("carries report coordinates as a map pin and maps image/source url", async () => {
    const items = await sosvenezuela2026.fetchItems();
    const r1 = items.find((i) => i.externalId === "r1")!;
    expect(r1.ubicacion).toMatchObject({ lat: 10.6, lng: -66.9 });
    expect(r1.imageUrl).toBe("https://cdn.example.com/a.jpg");
    expect(r1.sourceUrl).toBe("https://terremotovenezuela.com/");
    const r2 = items.find((i) => i.externalId === "r2")!;
    expect(r2.imageUrl).toBeUndefined();
    expect(r2.sourceUrl).toBeUndefined();
  });

  it("maps persons to desaparecidos with matchLocated status conventions", async () => {
    const items = await sosvenezuela2026.fetchItems();
    const p1 = items.find((i) => i.externalId === "p1")!;
    const p2 = items.find((i) => i.externalId === "p2")!;
    expect(p1.category).toBe("desaparecidos");
    expect(p1.status).toBe("buscando"); // seeking_info
    expect(p2.status).toBe("localizado"); // found_alive
    expect(p2.texto).toContain("Hospital de la Guaira");
    expect(p1.imageUrl).toContain("desaparecidosvenezuela.com");
  });

  it("never carries a person as a map pin (no coordinates in the API)", async () => {
    const items = await sosvenezuela2026.fetchItems();
    const persons = items.filter((i) => i.category === "desaparecidos");
    expect(persons.length).toBe(2);
    expect(persons.every((i) => i.ubicacion === undefined)).toBe(true);
  });

  it("uses the stable source id and item ids", async () => {
    const items = await sosvenezuela2026.fetchItems();
    expect(items.every((i) => i.sourceId === "sosvenezuela2026")).toBe(true);
  });

  it("persons is best-effort: a 429 mid-pagination keeps the accumulated items", async () => {
    // Página 0 OK, página 1 (offset 100) devuelve 429 → debe conservar los de
    // la página 0, no descartarlos ni tumbar los reports.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/reports")) {
          return new Response(JSON.stringify(REPORTS), { status: 200 });
        }
        if (url.includes("/api/persons/list")) {
          const offset = Number(new URL(url).searchParams.get("offset"));
          if (offset === 0) {
            // página llena (100) → el conector pide la siguiente
            const full = Array.from({ length: 100 }, (_, k) => ({
              ...PERSONS[0],
              id: `p${k}`,
            }));
            return new Response(JSON.stringify(full), { status: 200 });
          }
          return new Response("rate limited", { status: 429 });
        }
        return new Response("[]", { status: 200 });
      }),
    );
    const items = await sosvenezuela2026.fetchItems();
    const persons = items.filter((i) => i.category === "desaparecidos");
    expect(persons).toHaveLength(100); // conservó la página 0 pese al 429
    expect(items.some((i) => i.category === "edificios")).toBe(true); // reports intactos
  });
});

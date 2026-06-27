import { describe, it, expect, vi, beforeEach } from "vitest";
import ninos from "./fixtures/ninos.json";
import { ninosvenezuela } from "@/connectors/ninosvenezuela";

let lastInit: RequestInit | undefined;

beforeEach(() => {
  lastInit = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      lastInit = init;
      return new Response(JSON.stringify(ninos), { status: 200 });
    }),
  );
});

describe("ninosvenezuela connector", () => {
  it("maps every row to a desaparecidos item with stable id and sourceId", async () => {
    const items = await ninosvenezuela.fetchItems();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.category === "desaparecidos")).toBe(true);
    expect(items.every((i) => i.sourceId === "ninosvenezuela")).toBe(true);
    expect(items[0].externalId).toBe(ninos[0].id);
  });

  it("builds the title from nombre + apellido (trimming, apellido optional)", async () => {
    const items = await ninosvenezuela.fetchItems();
    expect(items[0].titulo).toBe("Liam");
    expect(items[1].titulo).toBe("María Pérez");
  });

  it("includes age, sex, family status and location text in texto", async () => {
    const [liam] = await ninosvenezuela.fetchItems();
    expect(liam.texto).toContain("3 años");
    expect(liam.texto).toContain("Masculino");
    expect(liam.texto).toContain("Sin familia localizada");
    expect(liam.texto).toContain("Hospital de la Guaira");
  });

  it("includes the child's cédula in texto when present", async () => {
    const [, maria] = await ninosvenezuela.fetchItems();
    expect(maria.texto).toContain("C.I. 30123456");
  });

  it("maps foto_url to imageUrl and omits it when null", async () => {
    const [liam, maria] = await ninosvenezuela.fetchItems();
    expect(liam.imageUrl).toContain("/storage/v1/object/public/");
    expect(maria.imageUrl).toBeUndefined();
  });

  it("never carries the child's location as a map pin (no lat/lng available)", async () => {
    const items = await ninosvenezuela.fetchItems();
    expect(items.every((i) => i.ubicacion === undefined)).toBe(true);
  });

  it("sends the Supabase apikey header and requests only safe columns", async () => {
    await ninosvenezuela.fetchItems();
    const headers = lastInit?.headers as Record<string, string> | undefined;
    expect(headers?.apikey).toBeTruthy();
    const url = (vi.mocked(fetch).mock.calls[0][0] as string) ?? "";
    // Datos del REGISTRANTE y notas médicas no se piden a la API (la cédula del
    // NIÑO sí se expone).
    for (const col of ["cedula_registra", "telefono", "quien_registra", "notas_medicas"]) {
      expect(url).not.toContain(col);
    }
  });

  it("returns [] on fetch failure (one source must not break the run)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("err", { status: 500 })),
    );
    expect(await ninosvenezuela.fetchItems()).toEqual([]);
  });
});

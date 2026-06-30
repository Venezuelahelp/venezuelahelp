import { describe, it, expect } from "vitest";
import {
  classifyLocated,
  extractSignals,
  matchLocated,
  nameKey,
} from "@/enrichment/matchLocated";
import type { StoredItem } from "@/shared/types";

function item(p: Partial<StoredItem>): StoredItem {
  return {
    category: "desaparecidos",
    sourceId: "s1",
    externalId: "1",
    titulo: "Juan Perez Lopez",
    texto: "",
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

function buscando(p: Partial<StoredItem>): StoredItem {
  return item({ status: "no_encontrado", ...p });
}
function localizado(p: Partial<StoredItem>): StoredItem {
  return item({ status: "encontrado", ...p });
}

describe("classifyLocated", () => {
  it("marca buscando por status conocidos", () => {
    expect(classifyLocated(item({ status: "no_encontrado" }))).toBe("buscando");
    expect(classifyLocated(item({ status: "buscando" }))).toBe("buscando");
  });
  it("marca localizado por status conocidos (incluye variantes con acentos)", () => {
    expect(classifyLocated(item({ status: "Ingresado" }))).toBe("localizado");
    expect(classifyLocated(item({ status: "A Salvo" }))).toBe("localizado");
    expect(classifyLocated(item({ status: "encontrado" }))).toBe("localizado");
  });
  it("excluye fallecidos y desconocidos", () => {
    expect(classifyLocated(item({ status: "deceased" }))).toBe("otro");
    expect(classifyLocated(item({ status: "xyz" }))).toBe("otro");
  });
  it("status vacío de fuente cuyo default es buscar → buscando", () => {
    expect(
      classifyLocated(
        item({ status: undefined, sourceId: "venezuela-te-busca" }),
      ),
    ).toBe("buscando");
    expect(
      classifyLocated(
        item({ status: undefined, sourceId: "terremotovenezuela" }),
      ),
    ).toBe("buscando");
    expect(classifyLocated(item({ status: undefined, sourceId: "s1" }))).toBe(
      "otro",
    );
  });
});

describe("nameKey", () => {
  it("ordena tokens y es orden-insensible", () => {
    expect(nameKey("Carla Cardozo")).toBe(nameKey("Cardozo Carla"));
  });
  it("quita acentos y tokens de 1 letra", () => {
    expect(nameKey("José A. Ñañez")).toBe("jose nanez");
  });
});

describe("extractSignals", () => {
  it("extrae cédula con o sin prefijo V-", () => {
    expect(extractSignals("CI V-12.345.678 reportado").cedula).toBe("12345678");
    expect(extractSignals("cedula 12345678").cedula).toBe("12345678");
  });
  it("extrae teléfono venezolano", () => {
    expect(extractSignals("contacto 0412-5551234").telefono).toBe(
      "04125551234",
    );
  });
  it("extrae hospital normalizado", () => {
    expect(
      extractSignals("ingresado en Hospital Pérez Carreño hoy").hospital,
    ).toBe("hospital perez carreno");
  });
  it("sin señales → objeto vacío", () => {
    expect(extractSignals("texto cualquiera")).toEqual({});
  });
});

describe("matchLocated", () => {
  it("NO matchea solo por nombre (sin señal dura), aunque sea 3+ tokens cross-source", () => {
    // Decisión validada con smoke: el match por solo-nombre genera homónimos.
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "Juan Perez Lopez" }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Lopez Juan Perez",
      }),
    ]);
    expect(m).toHaveLength(0);
  });

  it("matchea por señal dura (mismo hospital) aunque el nombre sea de 2 tokens", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Jose Garcia",
        texto: "visto en Hospital Perez Carreno",
      }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Garcia Jose",
        texto: "ingresado Hospital Perez Carreno",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].signal).toBe("hospital");
  });

  it("NO matchea nombre de 2 tokens sin señal dura (homónimo)", () => {
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "Jose Garcia" }),
      localizado({ sourceId: "B", externalId: "2", titulo: "Garcia Jose" }),
    ]);
    expect(m).toHaveLength(0);
  });

  it("NO matchea fallecido", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      item({
        status: "deceased",
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
    ]);
    expect(m).toHaveLength(0);
  });

  it("señal dura (hospital) entre fuentes distintas SÍ matchea, count=1", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].located.sourceId).toBe("B");
    expect(m[0].locatedSourcesCount).toBe(1);
  });

  it("corroboración: localizado por hospital en dos fuentes distintas → count=2 (azul)", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "C",
        externalId: "3",
        titulo: "Lopez Juan Perez",
        texto: "Hospital Vargas",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].locatedSourcesCount).toBe(2);
    expect(m[0].located.sources.sort()).toEqual(["B", "C"]);
  });

  it("dos localizados de la MISMA fuente no inflan el conteo", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "B",
        externalId: "3",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
    ]);
    expect(m[0].locatedSourcesCount).toBe(1);
  });

  it("título vacío se ignora", () => {
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "" }),
      localizado({ sourceId: "B", externalId: "2", titulo: "" }),
    ]);
    expect(m).toHaveLength(0);
  });

  it("dedup: una persona buscada con dos localizados candidatos → un match con la señal más fuerte", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "CI V-12345678",
      }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "C",
        externalId: "3",
        titulo: "Juan Perez Lopez",
        texto: "cedula 12345678",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].signal).toBe("cédula");
    expect(m[0].located.sourceId).toBe("C");
  });

  it("dedup por persona: varios buscados con el mismo nombre → UNA sola tarjeta", () => {
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      buscando({
        sourceId: "D",
        externalId: "9",
        titulo: "Lopez Juan Perez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
    ]);
    expect(m).toHaveLength(1);
  });

  it("dedup por persona AGREGA corroboración entre buscados distintos (azul)", () => {
    // Dos buscados del mismo nombre, cada uno respaldado por un hospital distinto
    // en una fuente distinta → al colapsar, la persona queda corroborada por 2.
    const m = matchLocated([
      buscando({
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      buscando({
        sourceId: "A",
        externalId: "2",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Universitario",
      }),
      localizado({
        sourceId: "B",
        externalId: "3",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Vargas",
      }),
      localizado({
        sourceId: "C",
        externalId: "4",
        titulo: "Juan Perez Lopez",
        texto: "Hospital Universitario",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].locatedSourcesCount).toBe(2);
    expect(m[0].located.sources.sort()).toEqual(["B", "C"]);
  });
});

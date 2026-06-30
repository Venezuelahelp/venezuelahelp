import { describe, it, expect } from "vitest";
import { searchItems, retrieve } from "../index";
import type { Snapshot } from "../index";

const snap: Snapshot = {
  generatedAt: "t",
  categories: {
    reportes: Array.from({ length: 6 }, (_, i) => ({
      category: "reportes",
      sourceId: "sismo",
      externalId: `r${i}`,
      titulo: `Noticia ${i}`,
      texto: "muchos desaparecidos en La Guaira",
    })),
    desaparecidos: [
      {
        category: "desaparecidos",
        sourceId: "vtb",
        externalId: "d1",
        titulo: "Ana Ruiz",
        texto: "La Guaira, por localizar",
      },
      {
        category: "desaparecidos",
        sourceId: "vtb",
        externalId: "d2",
        titulo: "Pedro Gómez",
        texto: "Caracas, por localizar",
      },
    ],
  },
};

describe("retrieve (bot)", () => {
  it("prioriza la categoría inferida de la pregunta", () => {
    const res = retrieve("¿hay desaparecidos en La Guaira?", snap, 12);
    expect(res[0].category).toBe("desaparecidos");
    expect(res.filter((i) => i.category === "desaparecidos")).toHaveLength(2);
  });
});

describe("searchItems (API/frontend)", () => {
  it("filtra por categoría y rankea por keyword", () => {
    const res = searchItems(snap, { category: "desaparecidos", q: "guaira" });
    expect(res).toHaveLength(1);
    expect(res[0].externalId).toBe("d1");
  });
  it("excluye sospechosos por defecto", () => {
    const s: Snapshot = {
      generatedAt: "t",
      categories: {
        reportes: [
          {
            category: "reportes",
            sourceId: "s",
            externalId: "1",
            titulo: "sismo guaira",
            texto: "x",
            trust: "sospechoso",
          },
        ],
      },
    };
    expect(searchItems(s, { q: "guaira" })).toHaveLength(0);
  });
});

// ── Tests migrados del bot (backend/src/telegram/__tests__/retrieval.test.ts) ──

describe("retrieve — category routing", () => {
  const big: Snapshot = {
    generatedAt: "t",
    categories: {
      reportes: Array.from({ length: 6 }, (_, i) => ({
        category: "reportes",
        sourceId: "sismo",
        externalId: `r${i}`,
        titulo: `Noticia ${i}`,
        texto: "Hay muchos desaparecidos tras el sismo en La Guaira",
      })),
      desaparecidos: [
        {
          category: "desaparecidos",
          sourceId: "vtb",
          externalId: "d1",
          titulo: "Vitarca Thamara Rada",
          texto: "58 años, Sector Caribe, La Guaira, por localizar",
        },
        {
          category: "desaparecidos",
          sourceId: "vtb",
          externalId: "d2",
          titulo: "Jhongelys Carao",
          texto: "11 años, La Guaira, por localizar",
        },
      ],
    },
  };

  it("prioritiza la categoría inferida de la pregunta", () => {
    const res = retrieve("¿Hay desaparecidos en La Guaira?", big, 12);
    const desap = res.filter((i) => i.category === "desaparecidos");
    expect(desap.length).toBe(2);
    expect(res[0].category).toBe("desaparecidos");
  });
});

describe("retrieve — field weighting", () => {
  const snapFw: Snapshot = {
    generatedAt: "t",
    categories: {
      acopios: [
        {
          category: "acopios",
          sourceId: "s",
          externalId: "en-texto",
          titulo: "Centro de ayuda",
          texto: "Aquí en Petare recibimos donaciones para todos",
        },
        {
          category: "acopios",
          sourceId: "s",
          externalId: "en-titulo",
          titulo: "Acopio Petare",
          texto: "Reciben insumos",
        },
      ],
    },
  };

  it("pondera coincidencia en título por encima de coincidencia en texto", () => {
    const res = retrieve("petare", snapFw, 5);
    expect(res[0].externalId).toBe("en-titulo");
  });
});

describe("retrieve — diversidad por categoría", () => {
  const snapDiv: Snapshot = {
    generatedAt: "t",
    categories: {
      acopios: Array.from({ length: 20 }, (_, i) => ({
        category: "acopios",
        sourceId: "s",
        externalId: `a${i}`,
        titulo: `Acopio Guaira ${i}`,
        texto: "",
      })),
      edificios: Array.from({ length: 3 }, (_, i) => ({
        category: "edificios",
        sourceId: "s",
        externalId: `e${i}`,
        titulo: `Edificio Guaira ${i}`,
        texto: "",
      })),
    },
  };

  it("no deja que una categoría cope todos los cupos en empates", () => {
    const res = retrieve("guaira", snapDiv, 10);
    expect(res.filter((i) => i.category === "edificios").length).toBe(3);
    expect(
      res.filter((i) => i.category === "acopios").length,
    ).toBeLessThanOrEqual(7);
  });
});

describe("retrieve — variantes singular/plural y género", () => {
  const snapVar: Snapshot = {
    generatedAt: "t",
    categories: {
      desaparecidos: [
        {
          category: "desaparecidos",
          sourceId: "s",
          externalId: "d1",
          titulo: "María Pérez",
          texto: "32 años, reportada como desaparecida en Vargas",
        },
      ],
      edificios: [
        {
          category: "edificios",
          sourceId: "s",
          externalId: "e1",
          titulo: "Edificio El Porvenir",
          texto: "estructura colapsada en el primer piso",
        },
      ],
    },
  };

  it("encuentra 'desaparecida' al preguntar 'desaparecidos'", () => {
    const res = retrieve("¿desaparecidos en Vargas?", snapVar, 5);
    expect(res.find((i) => i.externalId === "d1")).toBeDefined();
  });

  it("encuentra 'colapsada' al preguntar 'colapsados'", () => {
    const res = retrieve("edificios colapsados", snapVar, 5);
    expect(res.find((i) => i.externalId === "e1")).toBeDefined();
  });
});

describe("retrieve — ranking por término discriminante dentro de la categoría", () => {
  const snapDisc: Snapshot = {
    generatedAt: "t",
    categories: {
      desaparecidos: [
        {
          category: "desaparecidos",
          sourceId: "s",
          externalId: "header",
          titulo: "Desaparecidos",
          texto: "listado general",
        },
        {
          category: "desaparecidos",
          sourceId: "s",
          externalId: "caracas",
          titulo: "Pedro Gómez",
          texto: "40 años, Caracas, por localizar",
        },
        {
          category: "desaparecidos",
          sourceId: "s",
          externalId: "guaira",
          titulo: "Ana Ruiz",
          texto: "25 años, La Guaira, por localizar",
        },
      ],
    },
  };

  it("una ficha de La Guaira gana al encabezado genérico 'Desaparecidos'", () => {
    const res = retrieve("¿Hay desaparecidos en La Guaira?", snapDisc, 5);
    expect(res[0].externalId).toBe("guaira");
  });
});

describe("retrieve — enrichment", () => {
  it("excluye ítems sospechosos del retrieval", () => {
    const s = {
      generatedAt: "t",
      categories: {
        reportes: [
          {
            category: "reportes",
            sourceId: "s1",
            externalId: "1",
            titulo: "sismo guaira",
            texto: "x",
            trust: "sospechoso",
            isCanonical: true,
            sourcesCount: 1,
          },
          {
            category: "reportes",
            sourceId: "s2",
            externalId: "2",
            titulo: "sismo guaira",
            texto: "x",
            trust: "corroborado",
            isCanonical: true,
            sourcesCount: 2,
          },
        ],
      },
    } as unknown as Snapshot;
    const res = retrieve("sismo guaira", s, 15);
    expect(res.every((i) => i.trust !== "sospechoso")).toBe(true);
    expect(res).toHaveLength(1);
  });

  it("prioriza el canónico frente al duplicado a igual score", () => {
    const s = {
      generatedAt: "t",
      categories: {
        edificios: [
          {
            category: "edificios",
            sourceId: "s1",
            externalId: "1",
            titulo: "torre chacao",
            texto: "x",
            trust: "corroborado",
            isCanonical: false,
            dupOf: "s2#2",
            sourcesCount: 2,
          },
          {
            category: "edificios",
            sourceId: "s2",
            externalId: "2",
            titulo: "torre chacao",
            texto: "x",
            trust: "corroborado",
            isCanonical: true,
            sourcesCount: 2,
          },
        ],
      },
    } as unknown as Snapshot;
    const res = retrieve("torre chacao", s, 1);
    expect(res[0].isCanonical).toBe(true);
  });
});

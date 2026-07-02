import { describe, it, expect } from "vitest";
import {
  normalize,
  flatten,
  filterItems,
  countByCategory,
  countByStatus,
  sourcesForDisplay,
  hasStatusClass,
  sortItems,
} from "../filter";
import type { Category, Item, Snapshot } from "@/types";

describe("filter functions", () => {
  describe("normalize", () => {
    it("should lowercase the string", () => {
      expect(normalize("HELLO")).toBe("hello");
    });

    it("should strip accents", () => {
      expect(normalize("café")).toBe("cafe");
      expect(normalize("Desaparecidos")).toBe("desaparecidos");
      expect(normalize("año")).toBe("ano");
      expect(normalize("ESPAÑA")).toBe("espana");
    });

    it("should collapse whitespace", () => {
      expect(normalize("hello   world")).toBe("hello world");
      expect(normalize("  leading")).toBe("leading");
      expect(normalize("trailing  ")).toBe("trailing");
    });

    it("should handle combined accents (NFD decomposition)", () => {
      const withCombiningMarks = "é"; // é using combining acute accent
      expect(normalize(withCombiningMarks)).toBe("e");
    });

    it("should handle accents comprehensively", () => {
      expect(normalize("áéíóúàèìòù")).toBe("aeiouaeiou");
      expect(normalize("ÁÉÍÓÚÀÈÌÒÙ")).toBe("aeiouaeiou");
    });
  });

  describe("flatten", () => {
    it("should concatenate all items in category order", () => {
      const snap: Snapshot = {
        generatedAt: "2026-06-26T00:00:00Z",
        categories: {
          reportes: [
            {
              category: "reportes",
              sourceId: "s1",
              externalId: "e1",
              titulo: "Reporte 1",
              texto: "Contenido",
            },
          ],
          desaparecidos: [
            {
              category: "desaparecidos",
              sourceId: "s2",
              externalId: "e2",
              titulo: "Persona 1",
              texto: "Buscando",
            },
          ],
          acopios: [],
          edificios: [
            {
              category: "edificios",
              sourceId: "s3",
              externalId: "e3",
              titulo: "Edificio dañado",
              texto: "Piso 5",
            },
          ],
          solicitudes: [],
          hospitales: [],
        },
      };

      const result = flatten(snap);

      expect(result).toHaveLength(3);
      expect(result[0].category).toBe("reportes");
      expect(result[1].category).toBe("desaparecidos");
      expect(result[2].category).toBe("edificios");
    });

    it("colapsa duplicados: omite los ítems con isCanonical=false", () => {
      const snap: Snapshot = {
        generatedAt: "2026-06-26T00:00:00Z",
        categories: {
          reportes: [],
          desaparecidos: [
            {
              category: "desaparecidos",
              sourceId: "a",
              externalId: "1",
              titulo: "Ana Castillo",
              texto: "",
              isCanonical: true,
              sourcesCount: 2,
            },
            {
              category: "desaparecidos",
              sourceId: "b",
              externalId: "2",
              titulo: "Castillo Ana",
              texto: "",
              isCanonical: false,
              dupOf: "a#1",
            },
          ],
          acopios: [],
          edificios: [],
          solicitudes: [],
          hospitales: [],
        },
      };
      const result = flatten(snap);
      expect(result).toHaveLength(1);
      expect(result[0].sourceId).toBe("a");
    });

    it("excluye ítems con trust:'sospechoso'", () => {
      const snap: Snapshot = {
        generatedAt: "2026-06-30T00:00:00Z",
        categories: {
          reportes: [
            {
              category: "reportes",
              sourceId: "s1",
              externalId: "ok1",
              titulo: "Reporte normal",
              texto: "Contenido",
            },
            {
              category: "reportes",
              sourceId: "s2",
              externalId: "sus1",
              titulo: "Reporte sospechoso",
              texto: "Coordenadas fuera de VE",
              trust: "sospechoso",
            },
          ],
          desaparecidos: [],
          acopios: [],
          edificios: [],
          solicitudes: [],
          hospitales: [],
        },
      };
      const result = flatten(snap);
      expect(result).toHaveLength(1);
      expect(result[0].externalId).toBe("ok1");
    });

    it("should return empty array for empty snapshot", () => {
      const snap: Snapshot = {
        generatedAt: "2026-06-26T00:00:00Z",
        categories: {
          reportes: [],
          desaparecidos: [],
          acopios: [],
          edificios: [],
          solicitudes: [],
          hospitales: [],
        },
      };

      expect(flatten(snap)).toHaveLength(0);
    });
  });

  describe("filterItems", () => {
    const items: Item[] = [
      {
        category: "reportes",
        sourceId: "s1",
        externalId: "e1",
        titulo: "Incendio en Altamira",
        texto: "Gran incendio reportado",
        ubicacion: { lat: 10.5, lng: -66.8, nombre: "Caracas" },
      },
      {
        category: "desaparecidos",
        sourceId: "s2",
        externalId: "e2",
        titulo: "Buscando a María González",
        texto: "Desaparecida desde hace 3 días",
        ubicacion: { lat: 10.4, lng: -66.9, nombre: "Miranda" },
      },
      {
        category: "acopios",
        sourceId: "s3",
        externalId: "e3",
        titulo: "Acopio de comida",
        texto: "Aceptamos alimentos no perecederos",
        ubicacion: { lat: 10.45, lng: -66.85 },
      },
      {
        category: "reportes",
        sourceId: "s4",
        externalId: "e4",
        titulo: "Saqueos en tienda",
        texto: "Múltiples saqueos reportados",
        ubicacion: { lat: 10.48, lng: -66.82, nombre: "Chacao" },
      },
    ];

    it("should return all items when query is empty and active is empty", () => {
      const result = filterItems(items, "", new Set());
      expect(result).toHaveLength(4);
    });

    it("should filter by query with accent-insensitive substring match", () => {
      const result = filterItems(items, "Incendio", new Set());
      expect(result).toHaveLength(1);
      expect(result[0].titulo).toBe("Incendio en Altamira");
    });

    it("should match query ignoring accents", () => {
      const result = filterItems(items, "Maria", new Set()); // Without accent
      expect(result).toHaveLength(1);
      expect(result[0].titulo).toContain("María");
    });

    it("should search in titulo, texto, and ubicacion.nombre", () => {
      const resultTitulo = filterItems(items, "Incendio", new Set());
      expect(resultTitulo).toHaveLength(1);

      const resultTexto = filterItems(items, "perecederos", new Set());
      expect(resultTexto).toHaveLength(1);
      expect(resultTexto[0].category).toBe("acopios");

      const resultUbicacion = filterItems(items, "Miranda", new Set());
      expect(resultUbicacion).toHaveLength(1);
      expect(resultUbicacion[0].titulo).toContain("María");
    });

    it("should filter by active categories", () => {
      const active = new Set<Category>(["reportes"]);
      const result = filterItems(items, "", active);
      expect(result).toHaveLength(2);
      expect(result.every((item) => item.category === "reportes")).toBe(true);
    });

    it("should filter by multiple active categories", () => {
      const active = new Set<Category>(["reportes", "acopios"]);
      const result = filterItems(items, "", active);
      expect(result).toHaveLength(3);
      expect(
        result.every(
          (item) => item.category === "reportes" || item.category === "acopios",
        ),
      ).toBe(true);
    });

    it("should apply both query and category filters", () => {
      const active = new Set<Category>(["reportes"]);
      const result = filterItems(items, "Saqueos", active);
      expect(result).toHaveLength(1);
      expect(result[0].titulo).toBe("Saqueos en tienda");
    });

    it("should return empty array when query doesn't match any items", () => {
      const result = filterItems(items, "nonexistent", new Set());
      expect(result).toHaveLength(0);
    });

    it("should be case-insensitive in query", () => {
      const resultLower = filterItems(items, "incendio", new Set());
      const resultUpper = filterItems(items, "INCENDIO", new Set());
      expect(resultLower).toHaveLength(resultUpper.length);
    });

    it("should handle empty items array", () => {
      const result = filterItems([], "query", new Set());
      expect(result).toHaveLength(0);
    });

    it("filterItems(items, 'petare', new Set()) returns titulo-match first (ranked by core)", () => {
      const petareItems: Item[] = [
        {
          category: "reportes",
          sourceId: "py",
          externalId: "p2",
          titulo: "Reporte general",
          texto: "El barrio de Petare sufrió afectaciones",
        },
        {
          category: "reportes",
          sourceId: "px",
          externalId: "p1",
          titulo: "Daños en Petare",
          texto: "Se reportaron daños en la zona",
        },
      ];
      const result = filterItems(petareItems, "petare", new Set());
      expect(result).toHaveLength(2);
      // El match en el título (peso 6) debe vencer al match solo en texto (peso 2).
      expect(result[0].titulo).toContain("Petare");
    });

    it("filterItems con active Set filtra por categoría antes de buscar", () => {
      const result = filterItems(
        items,
        "",
        new Set<Category>(["desaparecidos"]),
      );
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe("desaparecidos");
    });
  });

  describe("countByCategory", () => {
    it("should count items by category", () => {
      const items: Item[] = [
        {
          category: "reportes",
          sourceId: "s1",
          externalId: "e1",
          titulo: "Report 1",
          texto: "text",
        },
        {
          category: "reportes",
          sourceId: "s2",
          externalId: "e2",
          titulo: "Report 2",
          texto: "text",
        },
        {
          category: "desaparecidos",
          sourceId: "s3",
          externalId: "e3",
          titulo: "Person 1",
          texto: "text",
        },
        {
          category: "acopios",
          sourceId: "s4",
          externalId: "e4",
          titulo: "Acopio 1",
          texto: "text",
        },
      ];

      const counts = countByCategory(items);

      expect(counts.reportes).toBe(2);
      expect(counts.desaparecidos).toBe(1);
      expect(counts.acopios).toBe(1);
      expect(counts.edificios).toBe(0);
      expect(counts.solicitudes).toBe(0);
    });

    it("should initialize all categories to 0", () => {
      const items: Item[] = [
        {
          category: "reportes",
          sourceId: "s1",
          externalId: "e1",
          titulo: "Report",
          texto: "text",
        },
      ];

      const counts = countByCategory(items);

      expect(Object.keys(counts)).toHaveLength(6);
      expect(counts.reportes).toBe(1);
      expect(counts.desaparecidos).toBe(0);
      expect(counts.acopios).toBe(0);
      expect(counts.edificios).toBe(0);
      expect(counts.solicitudes).toBe(0);
      expect(counts.hospitales).toBe(0);
    });

    it("should handle empty items array", () => {
      const counts = countByCategory([]);

      expect(counts.reportes).toBe(0);
      expect(counts.desaparecidos).toBe(0);
      expect(counts.acopios).toBe(0);
      expect(counts.edificios).toBe(0);
      expect(counts.solicitudes).toBe(0);
    });
  });

  describe("filterItems por statusClass (sub-filtro desaparecidos)", () => {
    const desap = (over: Partial<Item>): Item => ({
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "e1",
      titulo: "Maria Perez",
      texto: "Vista por última vez en Chacao",
      ...over,
    });

    it("status='localizado' deja solo desaparecidos localizados", () => {
      const items = [
        desap({ externalId: "1", statusClass: "buscando" }),
        desap({ externalId: "2", statusClass: "localizado" }),
      ];
      const out = filterItems(
        items,
        "",
        new Set<Category>(["desaparecidos"]),
        "localizado",
      );
      expect(out.map((i) => i.externalId)).toEqual(["2"]);
    });

    it("no afecta a otras categorías activas a la vez", () => {
      const items: Item[] = [
        desap({ externalId: "1", statusClass: "buscando" }),
        {
          category: "acopios",
          sourceId: "s2",
          externalId: "9",
          titulo: "Acopio Las Mercedes",
          texto: "Reciben agua y medicinas",
        },
      ];
      const out = filterItems(
        items,
        "",
        new Set<Category>(["desaparecidos", "acopios"]),
        "localizado",
      );
      expect(out.map((i) => i.externalId)).toEqual(["9"]);
    });

    it("un desaparecido sin statusClass no pasa el sub-filtro (snapshot viejo)", () => {
      const out = filterItems(
        [desap({ externalId: "1" })],
        "",
        new Set<Category>(["desaparecidos"]),
        "buscando",
      );
      expect(out).toEqual([]);
    });

    it("'todos' (default) no filtra por status", () => {
      const out = filterItems(
        [desap({ externalId: "1", statusClass: "buscando" })],
        "",
        new Set<Category>(["desaparecidos"]),
      );
      expect(out).toHaveLength(1);
    });

    it("se combina con la búsqueda por query", () => {
      const items = [
        desap({
          externalId: "1",
          statusClass: "localizado",
          titulo: "Maria Perez",
        }),
        desap({
          externalId: "2",
          statusClass: "localizado",
          titulo: "Pedro Gomez",
        }),
      ];
      const out = filterItems(
        items,
        "maria",
        new Set<Category>(["desaparecidos"]),
        "localizado",
      );
      expect(out.map((i) => i.externalId)).toEqual(["1"]);
    });
  });

  describe("countByStatus (desglose desaparecidos #50/#54)", () => {
    const desap = (statusClass?: "buscando" | "localizado"): Item => ({
      category: "desaparecidos",
      sourceId: "s1",
      externalId: Math.random().toString(),
      titulo: "Maria Perez",
      texto: "t",
      ...(statusClass ? { statusClass } : {}),
    });

    it("cuenta buscando y localizado solo sobre desaparecidos", () => {
      const items: Item[] = [
        desap("buscando"),
        desap("buscando"),
        desap("localizado"),
        {
          category: "acopios",
          sourceId: "s2",
          externalId: "a1",
          titulo: "Acopio",
          texto: "t",
        },
      ];
      expect(countByStatus(items)).toEqual({ buscando: 2, localizado: 1 });
    });

    it("ignora desaparecidos sin statusClass (snapshot viejo → 0/0)", () => {
      expect(countByStatus([desap(), desap()])).toEqual({
        buscando: 0,
        localizado: 0,
      });
    });

    it("array vacío → 0/0", () => {
      expect(countByStatus([])).toEqual({ buscando: 0, localizado: 0 });
    });
  });

  describe("hasStatusClass (feature-detect)", () => {
    const base: Item = {
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "e1",
      titulo: "Maria Perez",
      texto: "t",
    };

    it("true si algún ítem trae statusClass", () => {
      expect(hasStatusClass([base, { ...base, statusClass: "buscando" }])).toBe(
        true,
      );
    });

    it("false para snapshots viejos sin el campo", () => {
      expect(hasStatusClass([base])).toBe(false);
    });
  });

  describe("sourcesForDisplay", () => {
    const items: Item[] = [
      {
        category: "reportes",
        sourceId: "a",
        externalId: "1",
        titulo: "t",
        texto: "x",
      },
      {
        category: "reportes",
        sourceId: "a",
        externalId: "2",
        titulo: "t",
        texto: "x",
      },
      {
        category: "acopios",
        sourceId: "a",
        externalId: "3",
        titulo: "t",
        texto: "x",
      },
      {
        category: "reportes",
        sourceId: "b",
        externalId: "4",
        titulo: "t",
        texto: "x",
      },
    ];

    it("lists every configured source, sorted by item count descending", () => {
      const result = sourcesForDisplay(["b", "a"], items);
      expect(result).toEqual([
        { sourceId: "a", count: 3, cats: ["reportes", "acopios"] },
        { sourceId: "b", count: 1, cats: ["reportes"] },
      ]);
    });

    it("orders cats by frequency descending", () => {
      // 'a' tiene 2 reportes y 1 acopio → reportes primero.
      const [a] = sourcesForDisplay(["a"], items);
      expect(a.cats).toEqual(["reportes", "acopios"]);
    });

    it("includes configured sources with no items (count 0, empty cats)", () => {
      const result = sourcesForDisplay(["a", "vacia"], items);
      expect(result).toContainEqual({ sourceId: "vacia", count: 0, cats: [] });
    });

    it("ignores sourceIds present in items but absent from the directory", () => {
      const result = sourcesForDisplay(["a"], items);
      expect(result.map((s) => s.sourceId)).toEqual(["a"]);
    });
  });
});

describe("sortItems", () => {
  const it1: Item = {
    category: "reportes",
    sourceId: "s1",
    externalId: "1",
    titulo: "Viejo corroborado",
    texto: "t",
    lastSeenAt: "2026-06-28T00:00:00Z",
    sourcesCount: 3,
  };
  const it2: Item = {
    category: "reportes",
    sourceId: "s1",
    externalId: "2",
    titulo: "Reciente solitario",
    texto: "t",
    lastSeenAt: "2026-07-01T00:00:00Z",
    sourcesCount: 1,
  };
  const it3: Item = {
    category: "reportes",
    sourceId: "s1",
    externalId: "3",
    titulo: "Sin fechas ni fuentes",
    texto: "t",
  };

  it("'relevancia' devuelve el orden de entrada intacto (misma referencia)", () => {
    const arr = [it1, it2, it3];
    expect(sortItems(arr, "relevancia")).toBe(arr);
  });

  it("'recientes' ordena por lastSeenAt desc; ausentes al final", () => {
    expect(
      sortItems([it3, it1, it2], "recientes").map((i) => i.externalId),
    ).toEqual(["2", "1", "3"]);
  });

  it("'corroborados' ordena por sourcesCount desc con empate por lastSeenAt", () => {
    const it4: Item = {
      ...it1,
      externalId: "4",
      lastSeenAt: "2026-07-02T00:00:00Z",
    };
    expect(
      sortItems([it2, it1, it4, it3], "corroborados").map((i) => i.externalId),
    ).toEqual(["4", "1", "2", "3"]);
  });

  it("no muta la entrada", () => {
    const arr = [it1, it2];
    sortItems(arr, "recientes");
    expect(arr.map((i) => i.externalId)).toEqual(["1", "2"]);
  });
});

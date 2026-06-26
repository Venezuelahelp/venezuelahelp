# Deduplicación entre fuentes y señal de confianza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar duplicados entre fuentes y asignar una señal de confianza a cada ítem, calculados de forma determinística al construir el `snapshot.json`.

**Architecture:** Un módulo puro nuevo `backend/src/enrichment/` agrupa los ítems del "mismo hecho" (clave determinística geo+persona+tokens con refuerzo Jaccard) y deriva por ítem `{ clusterKey, isCanonical, dupOf, sourcesCount, trust, trustReasons }`. `buildSnapshot` invoca el módulo por categoría y escribe las marcas dentro del snapshot. El bot (que lee ese mismo snapshot) prioriza canónicos/corroborados y excluye sospechosos.

**Tech Stack:** TypeScript strict, vitest, aws-sdk-client-mock. Sin dependencias nuevas (geoCell es redondeo de coordenadas propio).

## Global Constraints

- TypeScript strict siempre. Imports con alias `@/` → `backend/src`.
- Funciones de enrichment **puras**: sin DynamoDB, sin red, sin `Date.now()`. El tiempo (`lastSeenAt`) llega en los datos del ítem.
- TDD: test que falla → implementación mínima → verde → commit por tarea.
- Correr tests SIEMPRE desde el workspace backend: `npm test --workspace @venezuelahelp/backend`.
- Conventional Commits con emoji.
- Campos nuevos **aditivos y opcionales** donde aplique; no romper la suite actual.
- Un fallo por fuente/ítem no debe romper el snapshot completo.

---

### Task 1: `geoCell` — rejilla de coordenadas

**Files:**

- Create: `backend/src/enrichment/geoCell.ts`
- Test: `backend/src/enrichment/__tests__/geoCell.test.ts`

**Interfaces:**

- Produces: `export function geoCell(lat: number, lng: number, size?: number): string`
  — redondea cada coordenada a múltiplos de `size` (default `0.01`) y devuelve `"<latCell>:<lngCell>"`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { geoCell } from "@/enrichment/geoCell";

describe("geoCell", () => {
  it("coloca dos puntos cercanos (< tamaño de celda) en la misma celda", () => {
    expect(geoCell(10.501, -66.901)).toBe(geoCell(10.503, -66.904));
  });

  it("separa puntos en celdas distintas cuando distan más que el tamaño", () => {
    expect(geoCell(10.5, -66.9)).not.toBe(geoCell(10.55, -66.9));
  });

  it("respeta un tamaño de celda configurable", () => {
    expect(geoCell(10.5, -66.9, 0.1)).toBe(geoCell(10.54, -66.93, 0.1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- geoCell`
Expected: FAIL — `Cannot find module '@/enrichment/geoCell'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// Rejilla determinística para agrupar coordenadas cercanas sin dependencia de
// geohash. size=0.01 grados ≈ 1.1 km en latitud — suficiente para juntar dos
// reportes del mismo edificio/zona sin fusionar zonas distintas.
export function geoCell(lat: number, lng: number, size = 0.01): string {
  const cell = (n: number) => Math.round(n / size);
  return `${cell(lat)}:${cell(lng)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- geoCell`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/enrichment/geoCell.ts backend/src/enrichment/__tests__/geoCell.test.ts
git commit -m "✨ feat(enrichment): geoCell para agrupar coordenadas cercanas"
```

---

### Task 2: Config de enrichment + tipos derivados

**Files:**

- Modify: `backend/src/shared/types.ts` (agregar `EnrichmentConfig`, extender `Config`, agregar `ItemEnrichment`, `trustLevel?` en `Source`)
- Modify: `backend/src/shared/repos/configRepo.ts` (default + lectura del bloque)
- Test: `backend/src/shared/__tests__/configRepo.test.ts` (extender)

**Interfaces:**

- Produces:
  ```typescript
  export interface EnrichmentConfig {
    geocerca: {
      latMin: number;
      latMax: number;
      lngMin: number;
      lngMax: number;
    };
    blocklist: string[];
    jaccardThreshold: number;
    geoCellSize: number;
    minTextLen: number;
  }
  export type TrustLevel =
    | "verificado"
    | "corroborado"
    | "no_verificado"
    | "sospechoso";
  export interface ItemEnrichment {
    clusterKey: string;
    isCanonical: boolean;
    dupOf?: string;
    sourcesCount: number;
    trust: TrustLevel;
    trustReasons: string[];
  }
  // Config gana: enrichment: EnrichmentConfig
  // Source gana: trustLevel?: "official"
  ```
- Consumes: nada nuevo.

- [ ] **Step 1: Write the failing test** (añadir a `configRepo.test.ts`)

```typescript
it("incluye defaults de enrichment cuando no hay Item", async () => {
  ddbMock.on(GetCommand).resolves({ Item: undefined });
  const cfg = await new ConfigRepo().get();
  expect(cfg.enrichment.jaccardThreshold).toBe(0.6);
  expect(cfg.enrichment.geoCellSize).toBe(0.01);
  expect(cfg.enrichment.geocerca).toMatchObject({ latMin: 0.6, latMax: 12.2 });
  expect(Array.isArray(cfg.enrichment.blocklist)).toBe(true);
});

it("usa enrichment persistido si existe", async () => {
  ddbMock.on(GetCommand).resolves({
    Item: {
      scrapeRateMin: 30,
      bedrockModelId: "amazon.nova-lite-v1:0",
      systemPrompt: "x",
      botTriggerMode: "mention",
      enrichment: {
        geocerca: { latMin: 1, latMax: 2, lngMin: -3, lngMax: -1 },
        blocklist: ["xxx"],
        jaccardThreshold: 0.8,
        geoCellSize: 0.05,
        minTextLen: 20,
      },
    },
  });
  const cfg = await new ConfigRepo().get();
  expect(cfg.enrichment.jaccardThreshold).toBe(0.8);
  expect(cfg.enrichment.blocklist).toEqual(["xxx"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- configRepo`
Expected: FAIL — `cfg.enrichment` undefined.

- [ ] **Step 3: Write minimal implementation**

En `types.ts` añadir los tipos del bloque Interfaces y extender `Config` con `enrichment: EnrichmentConfig` y `Source` con `trustLevel?: "official"`.

En `configRepo.ts`:

```typescript
const DEFAULT_ENRICHMENT: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: ["xxx", "test troll", "lorem ipsum"],
  jaccardThreshold: 0.6,
  geoCellSize: 0.01,
  minTextLen: 10,
};

const DEFAULT_CONFIG: Config = {
  scrapeRateMin: 30,
  bedrockModelId: "amazon.nova-lite-v1:0",
  systemPrompt:
    "Eres un asistente sobre el terremoto de Venezuela. Responde en español, solo con la información provista, cita la fuente y di 'No tengo ese dato' si no hay información relevante.",
  botTriggerMode: "mention",
  enrichment: DEFAULT_ENRICHMENT,
};
```

En `get()`, añadir al objeto devuelto cuando hay Item:
`enrichment: (res.Item.enrichment as EnrichmentConfig) ?? DEFAULT_ENRICHMENT,`
y mantener el `return { ...DEFAULT_CONFIG }` para el caso sin Item. Importar `EnrichmentConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- configRepo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/types.ts backend/src/shared/repos/configRepo.ts backend/src/shared/__tests__/configRepo.test.ts
git commit -m "✨ feat(enrichment): config de enrichment con defaults en Config"
```

---

### Task 3: `clusterize` — agrupar ítems del mismo hecho

**Files:**

- Create: `backend/src/enrichment/cluster.ts`
- Test: `backend/src/enrichment/__tests__/cluster.test.ts`

**Interfaces:**

- Consumes: `geoCell` (Task 1), `EnrichmentConfig` (Task 2), `StoredItem` (existente).
- Produces:

  ```typescript
  // normaliza texto a minúsculas sin tildes ni signos (NFD)
  export function normalizeText(s: string): string;
  // firma de tokens: top palabras significativas ordenadas, sin stopwords
  export function titleSignature(titulo: string): string[];
  export function jaccard(a: string[], b: string[]): number;
  // clave base por ítem (antes de fundir por Jaccard)
  export function baseKey(item: StoredItem, cfg: EnrichmentConfig): string;
  // agrupa: devuelve Map<clusterKey, StoredItem[]> ya fundido por Jaccard
  export function clusterize(
    items: StoredItem[],
    cfg: EnrichmentConfig,
  ): Map<string, StoredItem[]>;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  normalizeText,
  titleSignature,
  jaccard,
  clusterize,
} from "@/enrichment/cluster";
import type { StoredItem, EnrichmentConfig } from "@/shared/types";

const CFG: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: [],
  jaccardThreshold: 0.6,
  geoCellSize: 0.01,
  minTextLen: 10,
};

function item(p: Partial<StoredItem>): StoredItem {
  return {
    category: "edificios",
    sourceId: "s1",
    externalId: "1",
    titulo: "t",
    texto: "x",
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

describe("normalizeText", () => {
  it("quita tildes y baja a minúsculas", () => {
    expect(normalizeText("José Á. Pérez")).toBe("jose a perez");
  });
});

describe("jaccard", () => {
  it("1 para conjuntos iguales, 0 para disjuntos", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });
});

describe("clusterize", () => {
  it("agrupa por geoCell+zona dos fuentes en el mismo edificio", () => {
    const a = item({
      sourceId: "s1",
      externalId: "1",
      titulo: "Torre A",
      ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
    });
    const b = item({
      sourceId: "s2",
      externalId: "9",
      titulo: "Edificio en Chacao",
      ubicacion: { lat: 10.501, lng: -66.901, nombre: "Chacao" },
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(1);
    expect([...clusters.values()][0]).toHaveLength(2);
  });

  it("agrupa desaparecidos por nombre con y sin tilde", () => {
    const a = item({
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "1",
      titulo: "José Pérez",
    });
    const b = item({
      category: "desaparecidos",
      sourceId: "s2",
      externalId: "2",
      titulo: "Jose Perez",
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(1);
  });

  it("funde títulos similares por Jaccard cuando no hay geo ni persona", () => {
    const a = item({
      category: "reportes",
      sourceId: "s1",
      externalId: "1",
      titulo: "Colapso de puente en La Guaira reportado",
    });
    const b = item({
      category: "reportes",
      sourceId: "s2",
      externalId: "2",
      titulo: "Reportan colapso del puente en La Guaira",
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(1);
  });

  it("no agrupa hechos distintos", () => {
    const a = item({
      category: "reportes",
      sourceId: "s1",
      externalId: "1",
      titulo: "Sismo en Sucre magnitud cinco",
    });
    const b = item({
      category: "reportes",
      sourceId: "s2",
      externalId: "2",
      titulo: "Acopio de agua en Maracaibo abierto",
    });
    const clusters = clusterize([a, b], CFG);
    expect(clusters.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- cluster`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { geoCell } from "@/enrichment/geoCell";
import type { EnrichmentConfig, StoredItem } from "@/shared/types";

const STOP = new Set([
  "que",
  "los",
  "las",
  "del",
  "para",
  "con",
  "una",
  "uno",
  "por",
  "en",
  "de",
  "el",
  "la",
  "y",
  "a",
  "se",
  "su",
  "al",
  "lo",
  "es",
  "un",
]);

export function normalizeText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleSignature(titulo: string): string[] {
  return [
    ...new Set(
      normalizeText(titulo)
        .split(" ")
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    ),
  ].sort();
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function baseKey(item: StoredItem, cfg: EnrichmentConfig): string {
  if (item.category === "desaparecidos") {
    const person = normalizeText(item.titulo);
    const cell = item.ubicacion
      ? geoCell(item.ubicacion.lat, item.ubicacion.lng, cfg.geoCellSize)
      : "";
    return `p:${person}|${cell}`;
  }
  if (item.ubicacion) {
    const cell = geoCell(
      item.ubicacion.lat,
      item.ubicacion.lng,
      cfg.geoCellSize,
    );
    return `g:${cell}|${normalizeText(item.ubicacion.nombre ?? "")}`;
  }
  return `t:${titleSignature(item.titulo).join("-")}`;
}

export function clusterize(
  items: StoredItem[],
  cfg: EnrichmentConfig,
): Map<string, StoredItem[]> {
  // 1) agrupación exacta por clave base
  const base = new Map<string, StoredItem[]>();
  for (const it of items) {
    const k = baseKey(it, cfg);
    (base.get(k) ?? base.set(k, []).get(k)!).push(it);
  }
  // 2) refuerzo Jaccard SOLO entre claves de tipo título ("t:") que no
  // agruparon por geo/persona. Se funde la clave i en la clave j si la
  // similitud de sus firmas supera el umbral. Determinístico: orden estable.
  const keys = [...base.keys()];
  const titleKeys = keys.filter((k) => k.startsWith("t:"));
  const parent = new Map<string, string>(keys.map((k) => [k, k]));
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (let i = 0; i < titleKeys.length; i += 1) {
    for (let j = i + 1; j < titleKeys.length; j += 1) {
      const sigI = titleKeys[i].slice(2).split("-").filter(Boolean);
      const sigJ = titleKeys[j].slice(2).split("-").filter(Boolean);
      if (jaccard(sigI, sigJ) >= cfg.jaccardThreshold) {
        parent.set(find(titleKeys[j]), find(titleKeys[i]));
      }
    }
  }
  const merged = new Map<string, StoredItem[]>();
  for (const [k, list] of base) {
    const root = find(k);
    (merged.get(root) ?? merged.set(root, []).get(root)!).push(...list);
  }
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- cluster`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/enrichment/cluster.ts backend/src/enrichment/__tests__/cluster.test.ts
git commit -m "✨ feat(enrichment): clusterize con clave geo/persona/título + Jaccard"
```

---

### Task 4: `scoreTrust` — reglas de confianza

**Files:**

- Create: `backend/src/enrichment/trust.ts`
- Test: `backend/src/enrichment/__tests__/trust.test.ts`

**Interfaces:**

- Consumes: `normalizeText` (Task 3), `EnrichmentConfig`, `TrustLevel`, `StoredItem`.
- Produces:

  ```typescript
  export function scoreTrust(
    item: StoredItem,
    sourcesCount: number,
    source: { trustLevel?: "official" } | undefined,
    cfg: EnrichmentConfig,
  ): { trust: TrustLevel; trustReasons: string[] };
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { scoreTrust } from "@/enrichment/trust";
import type { StoredItem, EnrichmentConfig } from "@/shared/types";

const CFG: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: ["troll"],
  jaccardThreshold: 0.6,
  geoCellSize: 0.01,
  minTextLen: 10,
};

function item(p: Partial<StoredItem>): StoredItem {
  return {
    category: "reportes",
    sourceId: "s1",
    externalId: "1",
    titulo: "Reporte creíble",
    texto: "Texto suficientemente largo",
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

describe("scoreTrust", () => {
  it("1 fuente y plausible → no_verificado", () => {
    expect(scoreTrust(item({}), 1, undefined, CFG).trust).toBe("no_verificado");
  });
  it("2+ fuentes → corroborado", () => {
    expect(scoreTrust(item({}), 2, undefined, CFG).trust).toBe("corroborado");
  });
  it("fuente oficial → verificado", () => {
    expect(scoreTrust(item({}), 1, { trustLevel: "official" }, CFG).trust).toBe(
      "verificado",
    );
  });
  it("geo fuera de Venezuela → sospechoso con razón", () => {
    const r = scoreTrust(
      item({ ubicacion: { lat: 40, lng: -3 } }),
      3,
      undefined,
      CFG,
    );
    expect(r.trust).toBe("sospechoso");
    expect(r.trustReasons.join(" ")).toMatch(/geocerca|venezuela/i);
  });
  it("texto demasiado corto → sospechoso", () => {
    expect(scoreTrust(item({ texto: "corto" }), 1, undefined, CFG).trust).toBe(
      "sospechoso",
    );
  });
  it("match de blocklist → sospechoso", () => {
    expect(
      scoreTrust(item({ titulo: "esto es troll" }), 1, undefined, CFG).trust,
    ).toBe("sospechoso");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- trust`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { normalizeText } from "@/enrichment/cluster";
import type { EnrichmentConfig, StoredItem, TrustLevel } from "@/shared/types";

export function scoreTrust(
  item: StoredItem,
  sourcesCount: number,
  source: { trustLevel?: "official" } | undefined,
  cfg: EnrichmentConfig,
): { trust: TrustLevel; trustReasons: string[] } {
  const reasons: string[] = [];

  // 1) plausibilidad dura → sospechoso
  if (item.ubicacion) {
    const { lat, lng } = item.ubicacion;
    const g = cfg.geocerca;
    if (lat < g.latMin || lat > g.latMax || lng < g.lngMin || lng > g.lngMax) {
      reasons.push("ubicación fuera de la geocerca de Venezuela");
    }
  }
  if (!item.titulo.trim()) reasons.push("título vacío");
  if ((item.texto ?? "").trim().length < cfg.minTextLen) {
    reasons.push("texto demasiado corto");
  }
  const hay = normalizeText(`${item.titulo} ${item.texto}`);
  if (cfg.blocklist.some((b) => hay.includes(normalizeText(b)))) {
    reasons.push("coincide con la blocklist de spam/troleo");
  }
  if (reasons.length > 0) return { trust: "sospechoso", trustReasons: reasons };

  // 2) fuente oficial
  if (source?.trustLevel === "official") {
    return { trust: "verificado", trustReasons: ["fuente oficial"] };
  }
  // 3) corroboración
  if (sourcesCount >= 2) {
    return {
      trust: "corroborado",
      trustReasons: [`corroborado por ${sourcesCount} fuentes`],
    };
  }
  // 4) default honesto
  return {
    trust: "no_verificado",
    trustReasons: ["reportado por una sola fuente"],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- trust`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/enrichment/trust.ts backend/src/enrichment/__tests__/trust.test.ts
git commit -m "✨ feat(enrichment): scoreTrust con reglas de plausibilidad y corroboración"
```

---

### Task 5: `enrichItems` — orquestar cluster + trust por categoría

**Files:**

- Create: `backend/src/enrichment/index.ts`
- Test: `backend/src/enrichment/__tests__/index.test.ts`

**Interfaces:**

- Consumes: `clusterize` (Task 3), `scoreTrust` (Task 4), `itemKey` (existente, para el SK del canónico), `ItemEnrichment`, `EnrichmentConfig`, `StoredItem`.
- Produces:

  ```typescript
  export type EnrichedItem = StoredItem & ItemEnrichment;
  export function enrichItems(
    items: StoredItem[],
    cfg: EnrichmentConfig,
    sources?: Map<string, { trustLevel?: "official" }>,
  ): EnrichedItem[];
  ```

  `sources` mapea `sourceId → { trustLevel }`; si falta, se trata como no oficial.
  El canónico de cada cluster: mayor `sourcesCount` (= toda la del cluster) no aplica
  entre ítems del mismo cluster, así que se elige por `lastSeenAt` desc y luego SK asc.
  `dupOf` se setea con `"<sourceId>#<externalId>"` del canónico (sin él para el canónico).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { enrichItems } from "@/enrichment";
import type { StoredItem, EnrichmentConfig } from "@/shared/types";

const CFG: EnrichmentConfig = {
  geocerca: { latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 },
  blocklist: [],
  jaccardThreshold: 0.6,
  geoCellSize: 0.01,
  minTextLen: 10,
};

function item(p: Partial<StoredItem>): StoredItem {
  return {
    category: "edificios",
    sourceId: "s1",
    externalId: "1",
    titulo: "Torre",
    texto: "Texto suficientemente largo",
    ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
    raw: {},
    contentHash: "h",
    firstSeenAt: "2026-06-25T00:00:00Z",
    lastSeenAt: "2026-06-25T00:00:00Z",
    ...p,
  };
}

describe("enrichItems", () => {
  it("marca corroboración y duplicado cuando 2 fuentes coinciden", () => {
    const a = item({
      sourceId: "s1",
      externalId: "1",
      lastSeenAt: "2026-06-25T00:00:00Z",
    });
    const b = item({
      sourceId: "s2",
      externalId: "9",
      lastSeenAt: "2026-06-26T00:00:00Z",
    });
    const out = enrichItems([a, b], CFG);
    expect(out.every((i) => i.sourcesCount === 2)).toBe(true);
    expect(out.every((i) => i.trust === "corroborado")).toBe(true);
    const canon = out.find((i) => i.isCanonical)!;
    const dup = out.find((i) => !i.isCanonical)!;
    expect(canon.externalId).toBe("9"); // más reciente
    expect(dup.dupOf).toBe("s2#9");
    expect(canon.dupOf).toBeUndefined();
  });

  it("ítem único de una fuente → no_verificado y canónico de su cluster", () => {
    const out = enrichItems([item({ sourceId: "s1", externalId: "1" })], CFG);
    expect(out[0].sourcesCount).toBe(1);
    expect(out[0].isCanonical).toBe(true);
    expect(out[0].trust).toBe("no_verificado");
  });

  it("no muta la entrada", () => {
    const a = item({});
    enrichItems([a], CFG);
    expect("trust" in a).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- enrichment/__tests__/index`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { clusterize } from "@/enrichment/cluster";
import { scoreTrust } from "@/enrichment/trust";
import type {
  EnrichmentConfig,
  ItemEnrichment,
  StoredItem,
} from "@/shared/types";

export type EnrichedItem = StoredItem & ItemEnrichment;

function sk(item: StoredItem): string {
  return `${item.sourceId}#${item.externalId}`;
}

export function enrichItems(
  items: StoredItem[],
  cfg: EnrichmentConfig,
  sources?: Map<string, { trustLevel?: "official" }>,
): EnrichedItem[] {
  const clusters = clusterize(items, cfg);
  const out: EnrichedItem[] = [];

  for (const [clusterKey, list] of clusters) {
    const sourcesCount = new Set(list.map((i) => i.sourceId)).size;
    // canónico: más reciente; desempate por SK ascendente (estable)
    const canonical = [...list].sort((a, b) => {
      const t = b.lastSeenAt.localeCompare(a.lastSeenAt);
      return t !== 0 ? t : sk(a).localeCompare(sk(b));
    })[0];
    const canonicalSk = sk(canonical);

    for (const it of list) {
      const isCanonical = sk(it) === canonicalSk;
      const { trust, trustReasons } = scoreTrust(
        it,
        sourcesCount,
        sources?.get(it.sourceId),
        cfg,
      );
      out.push({
        ...it,
        clusterKey,
        isCanonical,
        ...(isCanonical ? {} : { dupOf: canonicalSk }),
        sourcesCount,
        trust,
        trustReasons,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- enrichment/__tests__/index`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/enrichment/index.ts backend/src/enrichment/__tests__/index.test.ts
git commit -m "✨ feat(enrichment): enrichItems orquesta cluster y trust por categoría"
```

---

### Task 6: Integrar enrichment en `buildSnapshot`

**Files:**

- Modify: `backend/src/public-snapshot/snapshot.ts`
- Test: `backend/src/public-snapshot/__tests__/snapshot.test.ts` (extender)

**Interfaces:**

- Consumes: `enrichItems` + `EnrichedItem` (Task 5), `ConfigRepo.get` (Task 2), `SourceRepo.listEnabled` (existente, para `trustLevel`).
- Produces: el snapshot escrito ahora contiene, por ítem, los campos de `ItemEnrichment`. `PublicItem` pasa a `Omit<EnrichedItem, "raw">`.

- [ ] **Step 1: Write the failing test** (añadir al test del snapshot)

```typescript
it("incluye marcas de enrichment por ítem en el snapshot", async () => {
  const items = [
    {
      PK: "CAT#edificios",
      SK: "s1#1",
      category: "edificios",
      sourceId: "s1",
      externalId: "1",
      titulo: "Torre",
      texto: "Texto suficientemente largo",
      ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
      raw: {},
      contentHash: "h",
      firstSeenAt: "t",
      lastSeenAt: "2026-06-25T00:00:00Z",
    },
    {
      PK: "CAT#edificios",
      SK: "s2#9",
      category: "edificios",
      sourceId: "s2",
      externalId: "9",
      titulo: "Edificio",
      texto: "Texto suficientemente largo",
      ubicacion: { lat: 10.501, lng: -66.901, nombre: "Chacao" },
      raw: {},
      contentHash: "h",
      firstSeenAt: "t",
      lastSeenAt: "2026-06-26T00:00:00Z",
    },
  ];
  const itemRepo = {
    listByCategory: async (cat: string) => (cat === "edificios" ? items : []),
  };
  const configRepo = { get: async () => ({ ...DEFAULT_CONFIG_FOR_TEST }) };
  const sourceRepo = { listEnabled: async () => [] };
  const s3 = { send: vi.fn().mockResolvedValue({}) };
  await buildSnapshot("2026-06-26T12:00:00Z", {
    itemRepo,
    configRepo,
    sourceRepo,
    s3,
  } as never);
  const body = JSON.parse(
    (s3.send.mock.calls[0][0] as { input: { Body: string } }).input.Body,
  );
  const edif = body.categories.edificios;
  expect(edif).toHaveLength(2);
  expect(
    edif.every((i: { sourcesCount: number }) => i.sourcesCount === 2),
  ).toBe(true);
  expect(edif.every((i: { trust: string }) => i.trust === "corroborado")).toBe(
    true,
  );
  expect(edif.some((i: { isCanonical: boolean }) => i.isCanonical)).toBe(true);
  expect(edif[0].raw).toBeUndefined();
});
```

Nota para el implementador: define `DEFAULT_CONFIG_FOR_TEST` en el test con el bloque `enrichment` completo (mismos defaults de Task 2) y `scrapeRateMin/bedrockModelId/systemPrompt/botTriggerMode` rellenos. Importa `vi` de vitest. Ajusta los mocks existentes del archivo para pasar también `configRepo` y `sourceRepo` (los tests previos pueden pasar `configRepo` con defaults y `sourceRepo.listEnabled: async () => []`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- public-snapshot`
Expected: FAIL — el snapshot no trae `sourcesCount`/`trust`.

- [ ] **Step 3: Write minimal implementation**

Reescribir `snapshot.ts` para inyectar `ConfigRepo` y `SourceRepo`, enriquecer por categoría y exponer `EnrichedItem` sin `raw`:

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ItemRepo } from "@/shared/repos/itemRepo";
import { ConfigRepo } from "@/shared/repos/configRepo";
import { SourceRepo } from "@/shared/repos/sourceRepo";
import { enrichItems, type EnrichedItem } from "@/enrichment";
import { CATEGORIES, type Category } from "@/shared/types";

const s3 = new S3Client({});
const KEY = "snapshot.json";

type PublicItem = Omit<EnrichedItem, "raw">;

function toPublic({ raw, ...rest }: EnrichedItem): PublicItem {
  return rest;
}

interface Deps {
  itemRepo: Pick<ItemRepo, "listByCategory">;
  configRepo: Pick<ConfigRepo, "get">;
  sourceRepo: Pick<SourceRepo, "listEnabled">;
  s3: Pick<S3Client, "send">;
}

export async function buildSnapshot(
  now: string,
  deps?: Partial<Deps>,
): Promise<{ key: string; count: number }> {
  const itemRepo = (deps?.itemRepo as Deps["itemRepo"]) ?? new ItemRepo();
  const configRepo =
    (deps?.configRepo as Deps["configRepo"]) ?? new ConfigRepo();
  const sourceRepo =
    (deps?.sourceRepo as Deps["sourceRepo"]) ?? new SourceRepo();
  const client = (deps?.s3 as Deps["s3"]) ?? s3;

  const cfg = await configRepo.get();
  const sources = new Map(
    (await sourceRepo.listEnabled()).map((s) => [
      s.id,
      { trustLevel: s.trustLevel },
    ]),
  );

  const categories: Record<Category, PublicItem[]> = {} as Record<
    Category,
    PublicItem[]
  >;
  let count = 0;
  for (const cat of CATEGORIES) {
    const items = await itemRepo.listByCategory(cat);
    const enriched = enrichItems(items, cfg.enrichment, sources);
    categories[cat] = enriched.map(toPublic);
    count += enriched.length;
  }

  const body = JSON.stringify({ generatedAt: now, categories });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.SNAPSHOT_BUCKET,
      Key: KEY,
      Body: body,
      ContentType: "application/json",
      CacheControl: "public, max-age=300",
    }),
  );
  return { key: KEY, count };
}
```

`SourceRepo` debe exponer `listEnabled` (ya lo usa el orchestrator). Verifícalo; si su firma difiere, adapta el `.map`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- public-snapshot`
Expected: PASS (incluye los tests previos adaptados).

- [ ] **Step 5: Commit**

```bash
git add backend/src/public-snapshot/snapshot.ts backend/src/public-snapshot/__tests__/snapshot.test.ts
git commit -m "✨ feat(enrichment): buildSnapshot enriquece ítems con dedupe y confianza"
```

---

### Task 7: Bot — priorizar canónicos/corroborados y excluir sospechosos

**Files:**

- Modify: `backend/src/telegram/types.ts` (extender `PublicItem`)
- Modify: `backend/src/telegram/retrieval.ts`
- Test: `backend/src/telegram/__tests__/retrieval.test.ts` (extender)

**Interfaces:**

- Consumes: `PublicItem` extendido con `{ trust?: string; isCanonical?: boolean; sourcesCount?: number; dupOf?: string }` (todos opcionales para no romper snapshots viejos).
- Produces: `retrieve()` filtra `trust === "sospechoso"` y, a igualdad de score y categoría, prioriza `isCanonical` / mayor `sourcesCount`.

- [ ] **Step 1: Write the failing test**

```typescript
it("excluye ítems sospechosos del retrieval", () => {
  const snap = {
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
  } as never;
  const res = retrieve("sismo guaira", snap, 15);
  expect(res.every((i) => i.trust !== "sospechoso")).toBe(true);
  expect(res).toHaveLength(1);
});

it("prioriza el canónico frente al duplicado a igual score", () => {
  const snap = {
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
  } as never;
  const res = retrieve("torre chacao", snap, 1);
  expect(res[0].isCanonical).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- retrieval`
Expected: FAIL — sospechosos no se excluyen / orden no prioriza canónico.

- [ ] **Step 3: Write minimal implementation**

En `types.ts`, extender `PublicItem`:

```typescript
export interface PublicItem {
  category: string;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: { lat: number; lng: number; nombre?: string };
  status?: string;
  trust?: "verificado" | "corroborado" | "no_verificado" | "sospechoso";
  isCanonical?: boolean;
  dupOf?: string;
  sourcesCount?: number;
  trustReasons?: string[];
}
```

En `retrieval.ts`: dentro del doble loop que arma `scored`, saltar sospechosos:

```typescript
if (item.trust === "sospechoso") continue;
```

(colócalo junto al `if (score === 0 && !target) continue;`). Y reforzar el sort
para desempatar por canónico y corroboración tras el score:

```typescript
scored.sort((a, b) => {
  if (targetCats.size > 0 && a.target !== b.target) return a.target ? -1 : 1;
  if (b.score !== a.score) return b.score - a.score;
  const ca = a.item.isCanonical ? 1 : 0;
  const cb = b.item.isCanonical ? 1 : 0;
  if (ca !== cb) return cb - ca;
  return (b.item.sourcesCount ?? 0) - (a.item.sourcesCount ?? 0);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- retrieval`
Expected: PASS (incluidos los tests previos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/types.ts backend/src/telegram/retrieval.ts backend/src/telegram/__tests__/retrieval.test.ts
git commit -m "✨ feat(telegram): retrieval excluye sospechosos y prioriza canónicos"
```

---

### Task 8: Bot — exponer confianza/fuentes en el contexto del prompt

**Files:**

- Modify: `backend/src/telegram/prompt.ts`
- Test: `backend/src/telegram/__tests__/prompt.test.ts` (extender)

**Interfaces:**

- Consumes: `PublicItem` extendido (Task 7).
- Produces: `buildContext` añade, cuando existen, `sourcesCount` y `trust` a cada línea para que el modelo responda con la cautela debida.

- [ ] **Step 1: Write the failing test**

```typescript
it("incluye nº de fuentes y confianza cuando están presentes", () => {
  const ctx = buildContext([
    {
      category: "reportes",
      sourceId: "s1",
      externalId: "1",
      titulo: "Sismo",
      texto: "fuerte",
      trust: "corroborado",
      sourcesCount: 3,
    } as never,
  ]);
  expect(ctx).toMatch(/3 fuentes/);
  expect(ctx).toMatch(/corroborado/);
});

it("marca explícitamente lo no verificado", () => {
  const ctx = buildContext([
    {
      category: "reportes",
      sourceId: "s1",
      externalId: "1",
      titulo: "Rumor",
      texto: "algo",
      trust: "no_verificado",
      sourcesCount: 1,
    } as never,
  ]);
  expect(ctx).toMatch(/no verificado/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- prompt`
Expected: FAIL — el contexto no menciona fuentes/confianza.

- [ ] **Step 3: Write minimal implementation**

En `buildContext`, dentro del `.map`, construir un sufijo de confianza:

```typescript
const TRUST_LABEL: Record<string, string> = {
  verificado: "verificado",
  corroborado: "corroborado",
  no_verificado: "no verificado",
  sospechoso: "no verificado",
};
```

y al final de cada línea (antes o después de `| Fuente:`):

```typescript
const conf = it.trust
  ? ` | Confianza: ${TRUST_LABEL[it.trust] ?? it.trust}${
      it.sourcesCount ? ` (${it.sourcesCount} fuentes)` : ""
    }`
  : "";
```

Incluir `${conf}` en el template literal de la línea.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/prompt.ts backend/src/telegram/__tests__/prompt.test.ts
git commit -m "✨ feat(telegram): el contexto del bot expone confianza y nº de fuentes"
```

---

### Task 9: Verificación full + build + deploy

**Files:** ninguno (solo verificación y despliegue).

- [ ] **Step 1: Suite completa del backend**

Run: `npm test --workspace @venezuelahelp/backend`
Expected: PASS — toda la suite verde (incluye regresión de snapshot/retrieval/prompt/configRepo).

- [ ] **Step 2: Build de backend e infra**

Run: `npm run build`
Expected: compila sin errores de TypeScript (strict).

- [ ] **Step 3: Synth de CDK (sanity, sin deploy)**

Run: `cd infra && npx cdk synth --profile VenezuelaHelp`
Expected: genera plantillas sin error. (No hay cambios de infraestructura: el código nuevo va dentro de los Lambdas existentes; no se tocan stacks.)

- [ ] **Step 4: Deploy**

Run: `cd infra && npx cdk deploy --all --profile VenezuelaHelp --require-approval never`
Expected: actualiza los Lambdas (scraper/public-snapshot y telegram) con el código nuevo. Sin cambios de recursos.

- [ ] **Step 5: Smoke en vivo**

Disparar un scrape (botón "Scrape ahora" del admin o invocar el Lambda del scraper) y, tras ~1–2 min, descargar el `snapshot.json` del bucket y verificar que los ítems traen `trust`, `sourcesCount`, `isCanonical`. Preguntar algo al bot y confirmar que responde citando confianza/fuentes.

- [ ] **Step 6: Commit final (si hubo ajustes) y cierre de rama**

Dejar el working tree limpio. La rama `feat/dedup-y-confianza` queda lista para merge a `main` por el dueño.

---

## Self-Review

**Spec coverage:**

- Duplicación entre fuentes → Task 3 (clusterize) + Task 5 (isCanonical/dupOf/sourcesCount). ✓
- Datos no confiables → Task 4 (scoreTrust) + Task 5. ✓
- Mecanismo A + Jaccard + reglas → Task 1/3/4. ✓
- Enrichment en buildSnapshot, marcas en snapshot.json, sin persistir en DDB → Task 6. ✓
- Config editable sin deploy → Task 2. ✓
- Consumo por bot (prioriza/excluye + nota de confianza) → Task 7/8. ✓
- Testing TDD → cada tarea. ✓
- Sin GSI/campos en tabla → confirmado (no se toca itemRepo ni data-stack). ✓
- Deploy → Task 9. ✓

**Placeholder scan:** sin TBD/TODO; todo el código y comandos están explícitos.

**Type consistency:** `EnrichmentConfig`, `ItemEnrichment`, `TrustLevel`, `EnrichedItem`, `enrichItems`, `clusterize`, `scoreTrust`, `geoCell` usados con la misma firma en todas las tareas. `dupOf` formato `"sourceId#externalId"` consistente entre Task 5 y los tests de Task 6/7. `PublicItem` extendido con campos opcionales en Task 7, consumido en Task 8.

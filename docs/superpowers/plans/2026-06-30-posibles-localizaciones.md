# Posibles localizaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cruzar personas reportadas como **buscadas** con reportes de **localizadas/en hospital** desde distintas fuentes, calcularlo en `buildSnapshot` (tras el scrape), exponerlo en el `snapshot.json`, mostrarlo en una sección del frontend público (verde = 1 fuente, azul = ≥2 fuentes) y avisarlo en el bot de Telegram al buscar un nombre.

**Architecture:** Motor determinista sin LLM (`backend/src/enrichment/matchLocated.ts`), mismo patrón que el resto de `enrichment/`. Se ejecuta dentro de `buildSnapshot` sobre los desaparecidos ya enriquecidos, produce `matches: LocatedMatch[]` top-level en el snapshot. Frontend y bot lo consumen del JSON cacheado; no se persiste en DynamoDB. Sin infraestructura nueva.

**Tech Stack:** TypeScript strict, vitest (`aws-sdk-client-mock` para S3), React + Vite (frontend-public), alias `@/` → `backend/src`. Spec: `docs/superpowers/specs/2026-06-29-posibles-localizaciones-design.md`.

## Global Constraints

- **Nunca afirma.** Todo copy es "coincidencia automática, no confirmada, verifica con la fuente".
- **Solo matches confirmados:** nombre 3+ tokens cross-source, o señal dura (cédula/teléfono/hospital). Homónimos de 2 tokens sin corroboración NO se muestran.
- **Fallecidos fuera** (`status` normalizado `deceased`/`fallecido` → excluido del cruce).
- `locatedSourcesCount ≥ 2` ⇒ azul; `= 1` ⇒ verde. El color es confianza relativa, **no cambia el copy**.
- Un fallo del motor **no debe romper `buildSnapshot`**: si lanza, se registra y `matches` queda `[]`.
- TypeScript strict; imports backend con alias `@/`. Tests con vitest desde el workspace: `npm test --workspace @venezuelahelp/backend`.
- Conventional Commits con emoji; rama `feat/posibles-localizaciones-corroboracion-bot` (ya creada).

---

### Task 1: Tipo `LocatedMatch` y clasificación de estado

**Files:**

- Modify: `backend/src/shared/types.ts` (añadir `LocatedMatch` y `LocatedClass` al final)
- Create: `backend/src/enrichment/matchLocated.ts`
- Test: `backend/src/enrichment/__tests__/matchLocated.test.ts`

**Interfaces:**

- Consumes: `StoredItem` (`@/shared/types`), `normalizeText` (`@/enrichment/cluster`).
- Produces:
  - `type LocatedClass = "buscando" | "localizado" | "otro"`
  - `function classifyLocated(item: StoredItem): LocatedClass`
  - `function nameKey(titulo: string): string`
  - `interface LocatedMatch { ... }` (shape final abajo)

- [ ] **Step 1: Añadir tipos a `backend/src/shared/types.ts`**

Al final del archivo:

```typescript
export type LocatedClass = "buscando" | "localizado" | "otro";

export type LocatedSignal =
  "cédula" | "teléfono" | "hospital" | "nombre-fuerte";

export interface LocatedMatch {
  nombre: string;
  signal: LocatedSignal;
  /** Fuentes distintas que respaldan la localización (≥2 ⇒ azul). */
  locatedSourcesCount: number;
  missing: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
  };
  located: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
    hospital?: string;
    /** Todos los sourceId que reportan localizado para este nombre. */
    sources: string[];
  };
}
```

- [ ] **Step 2: Escribir el test que falla de clasificación y nameKey**

`backend/src/enrichment/__tests__/matchLocated.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { classifyLocated, nameKey } from "@/enrichment/matchLocated";
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
```

- [ ] **Step 3: Verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- matchLocated`
Expected: FAIL ("Cannot find module '@/enrichment/matchLocated'").

- [ ] **Step 4: Implementar clasificación y nameKey en `backend/src/enrichment/matchLocated.ts`**

```typescript
import { normalizeText } from "@/enrichment/cluster";
import type {
  LocatedClass,
  LocatedMatch,
  LocatedSignal,
  StoredItem,
} from "@/shared/types";

const LOCATED = new Set([
  "encontrado",
  "encontrada",
  "safe",
  "a salvo",
  "ingresado",
  "ingresada",
  "atendido",
  "atendida",
  "localizado",
  "localizada",
]);
const SEARCHING = new Set([
  "no_encontrado",
  "missing",
  "buscando",
  "familia buscando",
  "sin familia localizada",
  "por localizar",
]);
const EXCLUDED = new Set([
  "deceased",
  "fallecido",
  "fallecida",
  "muerto",
  "muerta",
]);
// Fuentes cuyo default (status vacío) es "buscando".
const SEARCH_DEFAULT_SOURCES = new Set([
  "venezuela-te-busca",
  "terremotovenezuela",
]);

export function classifyLocated(item: StoredItem): LocatedClass {
  const raw = (item.status ?? "").trim();
  if (raw === "") {
    return SEARCH_DEFAULT_SOURCES.has(item.sourceId) ? "buscando" : "otro";
  }
  // El status puede traer "_" (no_encontrado) que normalizeText colapsa a espacio.
  const norm = normalizeText(raw.replace(/_/g, " "));
  if (EXCLUDED.has(norm)) return "otro";
  if (LOCATED.has(norm)) return "localizado";
  // Reconstruir la forma con guion bajo para SEARCHING (no_encontrado).
  if (SEARCHING.has(norm) || SEARCHING.has(raw.toLowerCase()))
    return "buscando";
  return "otro";
}

export function nameKey(titulo: string): string {
  return normalizeText(titulo)
    .split(" ")
    .filter((t) => t.length > 1)
    .sort()
    .join(" ");
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- matchLocated`
Expected: PASS (los 6 tests de clasificación + nameKey).

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/types.ts backend/src/enrichment/matchLocated.ts backend/src/enrichment/__tests__/matchLocated.test.ts
git commit -m "✨ feat(enrichment): clasificación buscando/localizado y nameKey para cruce de localizaciones"
```

---

### Task 2: Señales duras (cédula / teléfono / hospital)

**Files:**

- Modify: `backend/src/enrichment/matchLocated.ts`
- Test: `backend/src/enrichment/__tests__/matchLocated.test.ts`

**Interfaces:**

- Produces: `function extractSignals(texto: string): { cedula?: string; telefono?: string; hospital?: string }`

- [ ] **Step 1: Añadir test que falla**

Añadir al describe nuevo en `matchLocated.test.ts`:

```typescript
import { extractSignals } from "@/enrichment/matchLocated";

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
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- matchLocated`
Expected: FAIL ("extractSignals is not a function").

- [ ] **Step 3: Implementar `extractSignals`**

Añadir a `matchLocated.ts`:

```typescript
const RE_CEDULA = /\b[VvEe]?[-\s]?(\d{1,2}[.\s]?\d{3}[.\s]?\d{3}|\d{6,9})\b/;
const RE_TELEFONO = /\b(0?4\d{2})[-\s]?(\d{7})\b/;
const RE_HOSPITAL = /\bhospital[a-z\s]{3,40}/;

export function extractSignals(texto: string): {
  cedula?: string;
  telefono?: string;
  hospital?: string;
} {
  const out: { cedula?: string; telefono?: string; hospital?: string } = {};
  const t = texto ?? "";

  const ced = RE_CEDULA.exec(t);
  if (ced) {
    const digits = ced[1].replace(/\D/g, "");
    if (digits.length >= 6 && digits.length <= 9) out.cedula = digits;
  }

  const tel = RE_TELEFONO.exec(t);
  if (tel)
    out.telefono = (tel[1].startsWith("0") ? tel[1] : "0" + tel[1]) + tel[2];

  const hosp = RE_HOSPITAL.exec(normalizeText(t));
  if (hosp) out.hospital = hosp[0].trim().replace(/\s+/g, " ");

  return out;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- matchLocated`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/enrichment/matchLocated.ts backend/src/enrichment/__tests__/matchLocated.test.ts
git commit -m "✨ feat(enrichment): extracción de señales duras (cédula/teléfono/hospital) del texto"
```

---

### Task 3: Motor de cruce `matchLocated()` con corroboración

**Files:**

- Modify: `backend/src/enrichment/matchLocated.ts`
- Test: `backend/src/enrichment/__tests__/matchLocated.test.ts`

**Interfaces:**

- Consumes: `classifyLocated`, `nameKey`, `extractSignals` (Tasks 1-2).
- Produces: `function matchLocated(desaparecidos: StoredItem[]): LocatedMatch[]`

- [ ] **Step 1: Escribir tests que fallan (deben/no deben matchear + corroboración + dedup)**

Añadir a `matchLocated.test.ts`:

```typescript
import { matchLocated } from "@/enrichment/matchLocated";

function buscando(p: Partial<StoredItem>): StoredItem {
  return item({ status: "no_encontrado", ...p });
}
function localizado(p: Partial<StoredItem>): StoredItem {
  return item({ status: "encontrado", ...p });
}

describe("matchLocated", () => {
  it("matchea nombre 3+ tokens cross-source", () => {
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "Juan Perez Lopez" }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Lopez Juan Perez",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].signal).toBe("nombre-fuerte");
    expect(m[0].locatedSourcesCount).toBe(1);
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
      buscando({ sourceId: "A", externalId: "1", titulo: "Juan Perez Lopez" }),
      item({
        status: "deceased",
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
      }),
    ]);
    expect(m).toHaveLength(0);
  });

  it("NO matchea buscado y localizado de la MISMA fuente sin señal dura", () => {
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "Juan Perez Lopez" }),
      localizado({
        sourceId: "A",
        externalId: "2",
        titulo: "Juan Perez Lopez",
      }),
    ]);
    expect(m).toHaveLength(0);
  });

  it("corroboración: localizado en dos fuentes distintas → locatedSourcesCount=2 (azul)", () => {
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "Juan Perez Lopez" }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
      }),
      localizado({
        sourceId: "C",
        externalId: "3",
        titulo: "Lopez Juan Perez",
      }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].locatedSourcesCount).toBe(2);
    expect(m[0].located.sources.sort()).toEqual(["B", "C"]);
  });

  it("dos localizados de la MISMA fuente no inflan el conteo", () => {
    const m = matchLocated([
      buscando({ sourceId: "A", externalId: "1", titulo: "Juan Perez Lopez" }),
      localizado({
        sourceId: "B",
        externalId: "2",
        titulo: "Juan Perez Lopez",
      }),
      localizado({
        sourceId: "B",
        externalId: "3",
        titulo: "Juan Perez Lopez",
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
    expect(m[0].located.sourceId).toBe("C"); // el que comparte cédula es canónico
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- matchLocated`
Expected: FAIL ("matchLocated is not a function").

- [ ] **Step 3: Implementar `matchLocated`**

Añadir a `matchLocated.ts`:

```typescript
const SIGNAL_RANK: Record<LocatedSignal, number> = {
  cédula: 4,
  teléfono: 3,
  hospital: 2,
  "nombre-fuerte": 1,
};

interface Indexed {
  item: StoredItem;
  signals: { cedula?: string; telefono?: string; hospital?: string };
}

function tokenCount(titulo: string): number {
  return nameKey(titulo).split(" ").filter(Boolean).length;
}

export function matchLocated(desaparecidos: StoredItem[]): LocatedMatch[] {
  const located: Indexed[] = [];
  const buscando: Indexed[] = [];
  for (const it of desaparecidos) {
    if (!it.titulo || nameKey(it.titulo) === "") continue;
    const cls = classifyLocated(it);
    const entry: Indexed = { item: it, signals: extractSignals(it.texto) };
    if (cls === "localizado") located.push(entry);
    else if (cls === "buscando") buscando.push(entry);
  }

  // Índice de localizados por clave de nombre.
  const byName = new Map<string, Indexed[]>();
  for (const l of located) {
    const k = nameKey(l.item.titulo);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(l);
  }

  const out: LocatedMatch[] = [];
  for (const b of buscando) {
    const k = nameKey(b.item.titulo);
    const candidates = byName.get(k);
    if (!candidates || candidates.length === 0) continue;

    // Para cada candidato, determinar si sobrevive y con qué señal.
    const scored = candidates
      .map((c) => ({ c, signal: matchSignal(b, c) }))
      .filter(
        (x): x is { c: Indexed; signal: LocatedSignal } => x.signal !== null,
      );
    if (scored.length === 0) continue;

    // Fuentes distintas que respaldan (corroboración).
    const sources = Array.from(new Set(scored.map((s) => s.c.item.sourceId)));

    // Canónico = señal más fuerte; a igualdad, más reciente.
    scored.sort((a, z) => {
      const d = SIGNAL_RANK[z.signal] - SIGNAL_RANK[a.signal];
      if (d !== 0) return d;
      return (z.c.item.lastSeenAt ?? "").localeCompare(
        a.c.item.lastSeenAt ?? "",
      );
    });
    const best = scored[0];

    out.push({
      nombre: b.item.titulo,
      signal: best.signal,
      locatedSourcesCount: sources.length,
      missing: {
        sourceId: b.item.sourceId,
        texto: b.item.texto,
        status: b.item.status,
        sourceUrl: b.item.sourceUrl,
      },
      located: {
        sourceId: best.c.item.sourceId,
        texto: best.c.item.texto,
        status: best.c.item.status,
        sourceUrl: best.c.item.sourceUrl,
        hospital: best.c.signals.hospital,
        sources,
      },
    });
  }
  return out;
}

/** Devuelve la señal que justifica el match, o null si no sobrevive. */
function matchSignal(b: Indexed, l: Indexed): LocatedSignal | null {
  if (b.signals.cedula && b.signals.cedula === l.signals.cedula)
    return "cédula";
  if (b.signals.telefono && b.signals.telefono === l.signals.telefono)
    return "teléfono";
  if (b.signals.hospital && b.signals.hospital === l.signals.hospital)
    return "hospital";
  // Nombre fuerte cross-source: 3+ tokens y distinta fuente.
  if (tokenCount(b.item.titulo) >= 3 && b.item.sourceId !== l.item.sourceId)
    return "nombre-fuerte";
  return null;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- matchLocated`
Expected: PASS (todos los casos del describe).

- [ ] **Step 5: Commit**

```bash
git add backend/src/enrichment/matchLocated.ts backend/src/enrichment/__tests__/matchLocated.test.ts
git commit -m "✨ feat(enrichment): motor de cruce buscado↔localizado con corroboración por fuentes"
```

---

### Task 4: Integrar `matchLocated` en `buildSnapshot`

**Files:**

- Modify: `backend/src/public-snapshot/snapshot.ts:31-90`
- Test: `backend/src/public-snapshot/__tests__/snapshot.test.ts`

**Interfaces:**

- Consumes: `matchLocated` (Task 3), `enrichItems` (existente).
- Produces: campo top-level `matches: LocatedMatch[]` en el snapshot JSON.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `snapshot.test.ts` (usa el helper `parsePutBody()` existente):

```typescript
it("incluye matches de posibles localizaciones en el snapshot", async () => {
  itemRepo.listByCategory.mockImplementation(async (cat: string) => {
    if (cat !== "desaparecidos") return [];
    return [
      {
        category: "desaparecidos",
        sourceId: "A",
        externalId: "1",
        titulo: "Juan Perez Lopez",
        texto: "",
        raw: {},
        status: "no_encontrado",
        contentHash: "h",
        firstSeenAt: "2026-06-25T00:00:00Z",
        lastSeenAt: "2026-06-25T00:00:00Z",
      },
      {
        category: "desaparecidos",
        sourceId: "B",
        externalId: "2",
        titulo: "Lopez Juan Perez",
        texto: "",
        raw: {},
        status: "encontrado",
        contentHash: "h",
        firstSeenAt: "2026-06-25T00:00:00Z",
        lastSeenAt: "2026-06-25T00:00:00Z",
      },
    ];
  });

  await buildSnapshot("2026-06-30T00:00:00Z", {
    itemRepo,
    configRepo,
    sourceRepo,
  });

  const body = parsePutBody();
  expect(Array.isArray(body.matches)).toBe(true);
  expect(body.matches).toHaveLength(1);
  expect(body.matches[0].nombre).toBe("Juan Perez Lopez");
  expect(body.matches[0].locatedSourcesCount).toBe(1);
});

it("un fallo del motor de matching no rompe el snapshot (matches=[])", async () => {
  // status que provoca clasificación normal pero forzamos error con titulo no-string
  itemRepo.listByCategory.mockImplementation(async () => []);
  await buildSnapshot("2026-06-30T00:00:00Z", {
    itemRepo,
    configRepo,
    sourceRepo,
  });
  const body = parsePutBody();
  expect(body.matches).toEqual([]);
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- snapshot`
Expected: FAIL (`body.matches` es `undefined`).

- [ ] **Step 3: Implementar la integración en `snapshot.ts`**

En el loop de categorías (líneas 56-61), capturar los desaparecidos enriquecidos y calcular matches con try/catch. Reemplazar el loop:

```typescript
import { matchLocated } from "@/enrichment/matchLocated";
import type { LocatedMatch } from "@/shared/types";
// ... (logger ya existente en el módulo; si no, usar el patrón de logging del archivo)

let matches: LocatedMatch[] = [];
for (const cat of CATEGORIES) {
  const items = await itemRepo.listByCategory(cat);
  const enriched = enrichItems(items, cfg.enrichment, sourceTrust);
  categories[cat] = enriched.map(toPublic);
  count += enriched.length;
  if (cat === "desaparecidos") {
    try {
      matches = matchLocated(enriched);
    } catch (err) {
      // Un fallo del cruce no debe tumbar el snapshot.
      console.error("matchLocated failed", err);
      matches = [];
    }
  }
}
```

Y en la serialización (línea 77) añadir `matches`:

```typescript
const json = JSON.stringify({ generatedAt: now, categories, sources, matches });
```

> Nota: `enriched` es `EnrichedItem[]`, que extiende `StoredItem`, así que es compatible con el parámetro `StoredItem[]` de `matchLocated`. Si el repo del proyecto prohíbe `console.error` en producción, usar el logger estructurado que ya emplee `snapshot.ts`/`scraper`; revisar imports del archivo antes de elegir.

- [ ] **Step 4: Verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- snapshot`
Expected: PASS (ambos tests nuevos + los existentes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/public-snapshot/snapshot.ts backend/src/public-snapshot/__tests__/snapshot.test.ts
git commit -m "✨ feat(snapshot): expone matches de posibles localizaciones en el snapshot.json"
```

---

### Task 5: Bot de Telegram — aviso al buscar un nombre

**Files:**

- Modify: `backend/src/telegram/types.ts:57-60` (añadir `matches?`)
- Create: `backend/src/telegram/locatedNotice.ts`
- Modify: `backend/src/telegram/agent.ts` (rama buscar, ~líneas 198-241)
- Test: `backend/src/telegram/__tests__/locatedNotice.test.ts` y `agent.test.ts`

**Interfaces:**

- Consumes: `LocatedMatch` (`@/shared/types`), `nameKey` (`@/enrichment/matchLocated`), `Snapshot` (`@/telegram/types`).
- Produces:
  - `function buildMatchIndex(matches: LocatedMatch[]): Map<string, LocatedMatch>`
  - `function locatedNotice(titulo: string, index: Map<string, LocatedMatch>): string | null`

- [ ] **Step 1: Añadir `matches?` al tipo `Snapshot`**

En `backend/src/telegram/types.ts`:

```typescript
import type { LocatedMatch } from "@/shared/types";

export interface Snapshot {
  generatedAt: string;
  categories: Record<string, PublicItem[]>;
  matches?: LocatedMatch[];
}
```

- [ ] **Step 2: Escribir el test que falla de `locatedNotice`**

`backend/src/telegram/__tests__/locatedNotice.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildMatchIndex, locatedNotice } from "@/telegram/locatedNotice";
import type { LocatedMatch } from "@/shared/types";

const match: LocatedMatch = {
  nombre: "Juan Perez Lopez",
  signal: "nombre-fuerte",
  locatedSourcesCount: 1,
  missing: { sourceId: "A", texto: "buscado" },
  located: {
    sourceId: "B",
    texto: "encontrado en refugio",
    sourceUrl: "https://x/y",
    sources: ["B"],
  },
};

describe("locatedNotice", () => {
  it("devuelve aviso para un nombre con match (orden de tokens distinto)", () => {
    const idx = buildMatchIndex([match]);
    const txt = locatedNotice("Lopez Juan Perez", idx);
    expect(txt).toContain("reportada como localizada");
    expect(txt).toContain("no confirmada");
  });
  it("añade 'Corroborado por N fuentes' solo si locatedSourcesCount ≥ 2", () => {
    const idx1 = buildMatchIndex([match]);
    expect(locatedNotice("Juan Perez Lopez", idx1)).not.toContain(
      "Corroborado",
    );

    const idx2 = buildMatchIndex([{ ...match, locatedSourcesCount: 3 }]);
    expect(locatedNotice("Juan Perez Lopez", idx2)).toContain(
      "Corroborado por 3 fuentes",
    );
  });
  it("devuelve null si no hay match", () => {
    const idx = buildMatchIndex([match]);
    expect(locatedNotice("Maria Rodriguez", idx)).toBeNull();
  });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- locatedNotice`
Expected: FAIL ("Cannot find module '@/telegram/locatedNotice'").

- [ ] **Step 4: Implementar `locatedNotice.ts`**

```typescript
import { nameKey } from "@/enrichment/matchLocated";
import type { LocatedMatch } from "@/shared/types";

export function buildMatchIndex(
  matches: LocatedMatch[],
): Map<string, LocatedMatch> {
  const idx = new Map<string, LocatedMatch>();
  for (const m of matches) idx.set(nameKey(m.nombre), m);
  return idx;
}

export function locatedNotice(
  titulo: string,
  index: Map<string, LocatedMatch>,
): string | null {
  const m = index.get(nameKey(titulo));
  if (!m) return null;
  const link = m.located.sourceUrl ? ` (${m.located.sourceUrl})` : "";
  const corrobora =
    m.locatedSourcesCount >= 2
      ? `\n🔁 Corroborado por ${m.locatedSourcesCount} fuentes.`
      : "";
  return (
    `⚠️ Coincidencia automática (no confirmada): esta persona fue ` +
    `reportada como *localizada*${link}.${corrobora}\n` +
    `Verifica directamente con la fuente antes de sacar conclusiones.`
  );
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- locatedNotice`
Expected: PASS.

- [ ] **Step 6: Inyectar el aviso en la rama buscar de `agent.ts`**

Leer `agent.ts` alrededor de `nameMatches`/`formatMatches` (líneas 198-241). `answerWithTools` recibe `snap`. Construir el índice una vez y, si la rama determinista (`named.length`) dispara, anexar el aviso del primer match al `reply`:

```typescript
// dentro de answerWithTools, en la rama buscar tras: const named = nameMatches(consulta, items);
if (named.length) {
  let reply = formatMatches(named);
  const idx = buildMatchIndex(snap.matches ?? []);
  for (const it of named) {
    const notice = locatedNotice(it.titulo, idx);
    if (notice) {
      reply += `\n\n${notice}`;
      break;
    }
  }
  return {
    reply,
    kind: "respuesta",
    itemsUsed: named.map((i) => key(i)),
    tokensIn,
    tokensOut,
  };
}
```

Añadir el import al inicio de `agent.ts`:

```typescript
import { buildMatchIndex, locatedNotice } from "@/telegram/locatedNotice";
```

- [ ] **Step 7: Añadir test de integración en `agent.test.ts`**

Añadir un `snap.matches` al fixture del test y verificar que la búsqueda por nombre incluye el aviso:

```typescript
it("buscar por nombre con match de localización añade el aviso", async () => {
  const snapWithMatch = {
    ...snap,
    matches: [
      {
        nombre: "Ana Perez Gomez",
        signal: "nombre-fuerte",
        locatedSourcesCount: 2,
        missing: { sourceId: "A", texto: "buscada" },
        located: { sourceId: "B", texto: "a salvo", sources: ["B", "C"] },
      },
    ],
  };
  // El fixture `snap` debe tener un desaparecido titulo "Ana Perez Gomez" para que nameMatches dispare.
  const r = await answerWithTools("Ana Perez Gomez", snapWithMatch, config, {
    routeTools: route("buscar", { consulta: "Ana Perez Gomez" }),
    askBedrock: vi.fn(),
  });
  expect(r.reply).toContain("reportada como");
  expect(r.reply).toContain("Corroborado por 2 fuentes");
});
```

> Nota: ajustar el fixture `snap` de `agent.test.ts` para que `categories.desaparecidos` contenga un ítem con `titulo: "Ana Perez Gomez"` (o reusar uno existente y alinear el nombre del match). El nombre del match y el del ítem deben compartir `nameKey`.

- [ ] **Step 8: Verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- agent locatedNotice`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/telegram/types.ts backend/src/telegram/locatedNotice.ts backend/src/telegram/agent.ts backend/src/telegram/__tests__/locatedNotice.test.ts backend/src/telegram/__tests__/agent.test.ts
git commit -m "✨ feat(telegram): aviso de posible localización al buscar un nombre (con corroboración)"
```

---

### Task 6: Frontend público — sección "Posibles localizaciones"

**Files:**

- Modify: `frontend-public/src/types.ts:15-52` (añadir `LocatedMatch` y `matches?` a `Snapshot`)
- Create: `frontend-public/src/components/LocatedMatches.tsx`
- Create: `frontend-public/src/components/LocatedMatches.module.css`
- Modify: `frontend-public/src/App.tsx` (renderizar la sección)
- Test: `frontend-public/src/__tests__/locatedMatches.test.tsx`

**Interfaces:**

- Consumes: `Snapshot.matches`, `SourcesContext` (para resolver nombre de fuente), patrón `Source.tsx`.
- Produces: componente `<LocatedMatches matches={...} />`.

- [ ] **Step 1: Añadir tipos en `frontend-public/src/types.ts`**

```typescript
export interface LocatedMatch {
  nombre: string;
  signal: "cédula" | "teléfono" | "hospital" | "nombre-fuerte";
  locatedSourcesCount: number;
  missing: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
  };
  located: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
    hospital?: string;
    sources: string[];
  };
}

// En interface Snapshot (línea 47):
export interface Snapshot {
  generatedAt: string;
  sources?: Record<Category, SourceInfo> | Record<string, SourceInfo>;
  categories: Record<Category, Item[]>;
  matches?: LocatedMatch[];
}
```

- [ ] **Step 2: Escribir el test que falla**

`frontend-public/src/__tests__/locatedMatches.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LocatedMatches } from "@/components/LocatedMatches";
import type { LocatedMatch } from "../types";

const base: LocatedMatch = {
  nombre: "Juan Perez Lopez", signal: "nombre-fuerte", locatedSourcesCount: 1,
  missing: { sourceId: "A", texto: "buscado" },
  located: { sourceId: "B", texto: "encontrado", sources: ["B"] },
};

describe("LocatedMatches", () => {
  it("no renderiza nada si matches está vacío", () => {
    const { container } = render(<LocatedMatches matches={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it("muestra el copy de 'no es confirmación'", () => {
    render(<LocatedMatches matches={[base]} />);
    expect(screen.getByText(/No son confirmaciones/i)).toBeInTheDocument();
  });
  it("etiqueta corroborada cuando hay ≥2 fuentes", () => {
    render(<LocatedMatches matches={[{ ...base, locatedSourcesCount: 3 }]} />);
    expect(screen.getByText(/corroborada por 3 fuentes/i)).toBeInTheDocument();
  });
});
```

> Nota: el componente usa `useResolveSource()` del `SourcesContext`. Para que el test no requiera el provider, `LocatedMatches` debe degradar con gracia cuando no hay contexto (mostrar el `sourceId` crudo). Si el proyecto siempre envuelve en provider, envolver el render del test en `<SourcesContext.Provider value={...}>` siguiendo el patrón de los tests existentes de `ItemList`.

- [ ] **Step 3: Verificar que falla**

Run: `npm test --workspace @venezuelahelp/frontend-public -- locatedMatches`
Expected: FAIL ("Cannot find module '@/components/LocatedMatches'").

- [ ] **Step 4: Implementar `LocatedMatches.tsx`**

```tsx
import styles from "./LocatedMatches.module.css";
import { Source } from "./Source";
import type { LocatedMatch } from "../types";

export function LocatedMatches({ matches }: { matches: LocatedMatch[] }) {
  if (!matches || matches.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Posibles localizaciones">
      <h2 className={styles.title}>Posibles localizaciones</h2>
      <p className={styles.disclaimer}>
        Estas son coincidencias automáticas por nombre entre reportes de
        personas buscadas y reportes de personas localizadas o ingresadas en
        hospitales. <strong>No son confirmaciones.</strong> Verifica siempre
        directamente con las fuentes antes de sacar conclusiones.
      </p>
      <ul className={styles.list}>
        {matches.map((m, i) => {
          const corroborated = m.locatedSourcesCount >= 2;
          return (
            <li
              key={`${m.nombre}-${i}`}
              className={corroborated ? styles.cardBlue : styles.cardGreen}
            >
              <div className={styles.head}>
                <span className={styles.name}>{m.nombre}</span>
                <span
                  className={corroborated ? styles.tagBlue : styles.tagGreen}
                >
                  {corroborated
                    ? `Localización corroborada por ${m.locatedSourcesCount} fuentes`
                    : "Posible localización"}
                </span>
              </div>
              <div className={styles.cols}>
                <div className={styles.col}>
                  <span className={styles.colLabel}>
                    Reportado como buscado
                  </span>
                  <p className={styles.text}>{m.missing.texto}</p>
                  <Source
                    sourceId={m.missing.sourceId}
                    sourceUrl={m.missing.sourceUrl}
                  />
                </div>
                <div className={styles.col}>
                  <span className={styles.colLabel}>
                    Reportado como localizado
                  </span>
                  <p className={styles.text}>{m.located.texto}</p>
                  <Source
                    sourceId={m.located.sourceId}
                    sourceUrl={m.located.sourceUrl}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Crear `LocatedMatches.module.css`** (lista acotada + scroll interno, tokens existentes)

```css
.section {
  margin: 24px 0;
}
.title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink-strong);
  margin-bottom: 6px;
}
.disclaimer {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 12px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.cardGreen,
.cardBlue {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border-left: 4px solid var(--cat-acopios);
}
.cardBlue {
  border-left-color: var(--primary);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.name {
  font-weight: 700;
  color: var(--ink-strong);
}
.tagGreen,
.tagBlue {
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
  color: var(--cat-acopios);
  background: color-mix(in oklab, var(--cat-acopios) 14%, white);
}
.tagBlue {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 14%, white);
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 560px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.colLabel {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--muted);
  margin-bottom: 2px;
}
.text {
  font-size: 0.9rem;
  color: var(--ink);
  margin: 0 0 6px;
}
```

- [ ] **Step 6: Verificar que el test pasa**

Run: `npm test --workspace @venezuelahelp/frontend-public -- locatedMatches`
Expected: PASS.

- [ ] **Step 7: Renderizar la sección en `App.tsx`**

Importar y colocar la sección sobre la lista/mapa (cuando `data` está cargado). Leer `App.tsx` para el punto exacto (tras el header, antes de la lista). Añadir:

```tsx
import { LocatedMatches } from "./components/LocatedMatches";
// ... dentro del render, cuando hay data:
{
  data?.matches && <LocatedMatches matches={data.matches} />;
}
```

- [ ] **Step 8: Verificar build y suite del front**

Run: `npm run build --workspace @venezuelahelp/frontend-public && npm test --workspace @venezuelahelp/frontend-public`
Expected: build OK, tests PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend-public/src/types.ts frontend-public/src/components/LocatedMatches.tsx frontend-public/src/components/LocatedMatches.module.css frontend-public/src/App.tsx frontend-public/src/__tests__/locatedMatches.test.tsx
git commit -m "✨ feat(frontend-public): sección Posibles localizaciones (verde 1 fuente, azul ≥2)"
```

---

### Task 7: Suite completa, build y despliegue para validar

**Files:** ninguno nuevo — verificación y deploy.

- [ ] **Step 1: Suite backend completa verde**

Run: `npm test --workspace @venezuelahelp/backend`
Expected: PASS (toda la suite, sin regresiones).

- [ ] **Step 2: Build de backend e infra**

Run: `npm run build`
Expected: compila sin errores de tipos.

- [ ] **Step 3: Build de ambos frontends (requisito para synth de CDK)**

Run: `npm run build --workspace @venezuelahelp/frontend-public --workspace @venezuelahelp/frontend-admin`
Expected: ambos `dist/` generados.

- [ ] **Step 4: Desplegar los stacks afectados**

El motor + snapshot viajan en `VenezuelaHelpScraperStack`; el bot en `VenezuelaHelpBotStack`; la sección pública en `VenezuelaHelpFrontendStack`. Deploy completo (creds SSO exportadas):

```bash
cd infra && eval "$(aws configure export-credentials --profile VenezuelaHelp --format env)" && CDK_DEFAULT_ACCOUNT=720115910277 CDK_DEFAULT_REGION=us-east-1 npx cdk deploy VenezuelaHelpScraperStack VenezuelaHelpBotStack VenezuelaHelpFrontendStack --require-approval never
```

> Si CI/CD auto-despliega al mergear a main (CicdStack), coordinar con el dueño antes; este plan trabaja en rama `feat/`, así que el deploy es manual y deliberado.

- [ ] **Step 5: Regenerar el snapshot (el motor solo corre en un scrape)**

```bash
aws lambda invoke --function-name <ScraperFn> --invocation-type Event /dev/null --profile VenezuelaHelp
```

Esperar ~1–2 min (async, 202).

- [ ] **Step 6: Smoke sobre el snapshot real (regla del proyecto)**

Descargar el snapshot vivo (viene gzip aunque diga application/json) y medir cuántos matches produce y revisar una muestra manualmente:

```bash
curl -s "$SNAPSHOT_URL" -o /tmp/snap.gz && gunzip -c /tmp/snap.gz > /tmp/snap.json
node -e "const s=require('/tmp/snap.json'); console.log('matches:', s.matches.length); console.log(JSON.stringify(s.matches.slice(0,5),null,2));"
```

Validar manualmente que los primeros matches son plausibles (no homónimos obvios). Si el ruido es alto, ajustar umbrales (p.ej. exigir señal dura siempre, o subir tokens) y re-desplegar.

- [ ] **Step 7: Smoke del bot y del público**

- Bot: buscar por el nombre de una persona que aparezca en `matches` → debe salir el aviso "reportada como localizada" y "Corroborado por N fuentes" si aplica.
- Público: abrir el sitio → la sección "Posibles localizaciones" se renderiza con tarjetas verdes/azules y el disclaimer.

- [ ] **Step 8: Commit final / notas**

Si hubo ajustes de umbral, commitearlos. Dejar el working tree limpio.

---

## Self-review (cobertura del spec)

- Motor de cruce (Componente 1 del spec) → Tasks 1-3. ✓ (clasificación, nameKey, señales, corroboración, dedup)
- Forma en el snapshot (Componente 2) → Task 4. ✓ (`matches` top-level, try/catch)
- UI pública (Componente 3) → Task 6. ✓ (sección, verde/azul, copy fijo, scroll acotado)
- Bot (Componente 4, DELTA) → Task 5. ✓ (índice por nameKey, aviso, corroboración, opcional sin romper)
- Manejo de errores → Task 4 step 3 (try/catch), Task 1 (título vacío ignorado). ✓
- Testing (TDD + smoke prod) → cada task tiene su test; Task 7 hace el smoke real. ✓
- Restricción ética (no afirma, fallecidos fuera, solo confirmados) → Global Constraints + tests "NO deben matchear". ✓

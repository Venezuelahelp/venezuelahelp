# Público: Status + Compartir — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloque E del spec `docs/superpowers/specs/2026-07-02-observabilidad-admin-bot-y-publico-status-design.md` (PR `feat/public-status-y-compartir`): el enrichment emite `statusClass` canónico ("buscando"/"localizado") para desaparecidos y el frontend público lo pinta (chip + sub-filtro), gana deeplink por ítem `#/item/<sourceId>/<externalId>` con "Copiar enlace", selector de ordenación, debounce en la búsqueda y pulido del detalle/empty state.

**Architecture:** El backend es la **única fuente de verdad** de la normalización de status: `enrichItems` (backend/src/enrichment/index.ts) llama al `classifyLocated` EXISTENTE (backend/src/enrichment/matchLocated.ts) y añade `statusClass` a las marcas de enrichment; el campo viaja al `snapshot.json` vía `toPublic` (mismo patrón que `sourceUrl`: simple spread, `snapshot.ts` no cambia). DynamoDB no cambia (las marcas de enrichment nunca se persisten). El frontend consume `statusClass` tal cual — **nunca parsea el `status` crudo** — y feature-detecta snapshots viejos sin el campo. El deeplink se integra en el hash router artesanal de `App.tsx` (estado `route` + comparaciones exactas) sin romper `#/fuentes`, `#/interpretes`, `#/api`, `#/api-docs`, `#/quienes-somos`: la ruta `#/item/...` no coincide con ningún flag de página y cae en la rama home, donde App superpone el modal de detalle.

**Tech Stack:** TypeScript strict, React 18 (Vite, CSS Modules), vitest + @testing-library/react (jsdom), backend vitest + aws-sdk-client-mock. Sin dependencias nuevas.

## Global Constraints

- **TypeScript strict** siempre; imports con alias `@/`.
- **TDD estricto** con vitest: test que falla → implementación mínima → verde → commit. Backend: `npm test --workspace @venezuelahelp/backend` (correr desde la raíz del repo; NUNCA `vitest` desde la raíz sin workspace, rompe el alias `@/`). Público: `npm test --workspace @venezuelahelp/frontend-public`.
- **Conventional Commits con emoji**: `<emoji> <tipo>(<scope>): <descripción imperativa>`.
- **Feature-detect para snapshots viejos**: si ningún ítem trae `statusClass`, el sub-filtro no se muestra; el chip simplemente no se pinta. Nada revienta con un snapshot pre-deploy.
- **El chip/filtro solo usa `statusClass`, NUNCA parsea `status` crudo en el frontend** (lección `lesson_canonical-fact-hardcoded-multiple-sites`: no duplicar el mapa de normalización).
- **Nada de scroll infinito nuevo**: se reutiliza el `InfiniteList` existente; los añadidos son controles y modal.
- No tocar DynamoDB, repos, ni el conector de ninguna fuente. `core/` no se modifica (tipado estructural: los ítems con `statusClass` extra siguen siendo asignables a `PublicItem` de core).
- Trabajo en worktree aislado partiendo de `origin/main`, rama `feat/public-status-y-compartir`. No tocar el árbol del dueño.

---

## Task 1 — Backend: `statusClass` en enrichment + snapshot + tipo del bot

**Files:**

- `backend/src/shared/types.ts` — interfaz `ItemEnrichment` (líneas 92–99): campo nuevo `statusClass?`.
- `backend/src/enrichment/index.ts` — `enrichItems` (bucle de las líneas 38–55): calcular y emitir el campo.
- `backend/src/telegram/types.ts` — `PublicItem` (líneas 39–55): campo nuevo `statusClass?`.
- `backend/src/enrichment/__tests__/index.test.ts` — tests nuevos (añadir al final, ~línea 112).
- `backend/src/public-snapshot/__tests__/snapshot.test.ts` — test nuevo (añadir dentro del `describe("buildSnapshot")`, ~línea 228).

**Interfaces:**

- Consumes: `classifyLocated(item: StoredItem): LocatedClass` de `@/enrichment/matchLocated` (`LocatedClass = "buscando" | "localizado" | "otro"`, ya definido en `backend/src/shared/types.ts:150`). Ya maneja: status vacío con default por fuente (`venezuela-te-busca`, `terremotovenezuela` → "buscando"), normalización de `no_encontrado`/`safe`/`a_salvo`/`Ingresado`/…, y fallecidos → "otro".
- Produces: `EnrichedItem` (= `StoredItem & ItemEnrichment`) con `statusClass?: "buscando" | "localizado"` SOLO cuando `item.category === "desaparecidos"` y `classifyLocated(item) !== "otro"`. Ausente en cualquier otro caso (nunca `undefined` explícito serializado: se omite la clave, igual que `dupOf`).
- `toPublic` en `backend/src/public-snapshot/snapshot.ts:15-17` es `({ raw, ...rest }) => rest` → el campo viaja al snapshot **sin tocar `snapshot.ts`** (mismo mecanismo por el que viaja `sourceUrl`). El test de snapshot lo verifica end-to-end.

### Steps

- [ ] **Test rojo (enrichment).** Añadir al final de `backend/src/enrichment/__tests__/index.test.ts` (después del `describe("enrichItems")` existente, reutilizando el helper `item()` y `CFG` del archivo):

  ```ts
  describe("enrichItems — statusClass (desaparecidos)", () => {
    it('emite statusClass "buscando" para status de búsqueda (no_encontrado)', () => {
      const out = enrichItems(
        [
          item({
            category: "desaparecidos",
            status: "no_encontrado",
            ubicacion: undefined,
          }),
        ],
        CFG,
      );
      expect(out[0].statusClass).toBe("buscando");
    });

    it('emite statusClass "localizado" para status de hallazgo (encontrado)', () => {
      const out = enrichItems(
        [
          item({
            category: "desaparecidos",
            status: "encontrado",
            ubicacion: undefined,
          }),
        ],
        CFG,
      );
      expect(out[0].statusClass).toBe("localizado");
    });

    it('respeta el default por fuente: venezuela-te-busca sin status → "buscando"', () => {
      const out = enrichItems(
        [
          item({
            category: "desaparecidos",
            sourceId: "venezuela-te-busca",
            status: undefined,
            ubicacion: undefined,
          }),
        ],
        CFG,
      );
      expect(out[0].statusClass).toBe("buscando");
    });

    it('NO emite el campo cuando classifyLocated da "otro" (fallecido)', () => {
      const out = enrichItems(
        [
          item({
            category: "desaparecidos",
            status: "fallecido",
            ubicacion: undefined,
          }),
        ],
        CFG,
      );
      expect("statusClass" in out[0]).toBe(false);
    });

    it("NO emite el campo fuera de desaparecidos aunque el status sea clasificable", () => {
      const out = enrichItems(
        [item({ category: "reportes", status: "encontrado" })],
        CFG,
      );
      expect("statusClass" in out[0]).toBe(false);
    });
  });
  ```

- [ ] **Correr y ver el fallo:**

  ```bash
  npm test --workspace @venezuelahelp/backend -- enrichment
  ```

  Esperado: los tests nuevos fallan. Los 3 primeros con `expected undefined to be 'buscando'/'localizado'` (además de error de tipo TS `Property 'statusClass' does not exist` si vitest lo reporta primero — ambos son el rojo correcto).

- [ ] **Implementación mínima.**

  1. `backend/src/shared/types.ts` — en `ItemEnrichment` (tras `trustReasons: string[];`, línea 98):

  ```ts
  // Solo en `desaparecidos`: clase canónica del status crudo, calculada con
  // classifyLocated (matchLocated.ts) al construir el snapshot. "otro" no se
  // emite (campo ausente). El frontend/bot usan SOLO este campo, nunca
  // parsean `status` crudo.
  statusClass?: "buscando" | "localizado";
  ```

  2. `backend/src/enrichment/index.ts` — añadir el import (junto a los existentes):

  ```ts
  import { classifyLocated } from "@/enrichment/matchLocated";
  ```

  y en el bucle interno (`for (const it of list)`, línea 38), antes del `out.push`:

  ```ts
  // Clase canónica del status (solo desaparecidos). classifyLocated es la
  // ÚNICA fuente de verdad de la normalización; "otro" → campo ausente.
  const statusClass =
    it.category === "desaparecidos" ? classifyLocated(it) : "otro";
  ```

  y en el objeto del `out.push({...})`, tras la línea del `dupOf`:

  ```ts
  ...(statusClass !== "otro" ? { statusClass } : {}),
  ```

  (No hay ciclo de imports: `matchLocated.ts` solo importa de `@/enrichment/cluster` y `@/shared/types`, nunca de `@/enrichment`.)

- [ ] **Verde:** `npm test --workspace @venezuelahelp/backend -- enrichment` → todos pasan.

- [ ] **Test rojo (snapshot end-to-end).** Añadir en `backend/src/public-snapshot/__tests__/snapshot.test.ts`, dentro del `describe("buildSnapshot")` (usa los helpers `parsePutBody`, `configRepo`, `sourceRepo` ya definidos en el archivo):

  ```ts
  it("statusClass viaja en el snapshot para desaparecidos (patrón sourceUrl)", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const itemRepo = {
      listByCategory: vi.fn(async (cat: string) =>
        cat === "desaparecidos"
          ? [
              {
                category: "desaparecidos",
                sourceId: "A",
                externalId: "1",
                titulo: "Maria Perez",
                texto: "Texto suficientemente largo",
                status: "no_encontrado",
                raw: {},
                contentHash: "h",
                firstSeenAt: "2026-07-01T00:00:00Z",
                lastSeenAt: "2026-07-01T00:00:00Z",
              },
              {
                category: "desaparecidos",
                sourceId: "A",
                externalId: "2",
                titulo: "Pedro Gomez",
                texto: "Texto suficientemente largo",
                status: "estado_rarisimo_sin_mapear",
                raw: {},
                contentHash: "h",
                firstSeenAt: "2026-07-01T00:00:00Z",
                lastSeenAt: "2026-07-01T00:00:00Z",
              },
            ]
          : [],
      ),
    };
    await buildSnapshot("2026-07-02T00:00:00Z", {
      itemRepo: itemRepo as never,
      configRepo: configRepo as never,
      sourceRepo: sourceRepo as never,
    });
    const body = parsePutBody();
    const desap = body.categories.desaparecidos;
    expect(desap.find((i: any) => i.externalId === "1").statusClass).toBe(
      "buscando",
    );
    // "otro" → la clave NO existe en el JSON (feature-detect limpio en el front).
    expect("statusClass" in desap.find((i: any) => i.externalId === "2")).toBe(
      false,
    );
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/backend -- snapshot` → el test nuevo falla con `expected undefined to be 'buscando'`… si la implementación del paso anterior ya está, este test debería pasar directamente (el campo viaja solo por el spread de `toPublic`). Si pasa a la primera, verificar que falla al comentar temporalmente la línea `...(statusClass !== "otro" ? { statusClass } : {})` — es la prueba de que el test muerde. Restaurar.

- [ ] **Tipo del bot.** En `backend/src/telegram/types.ts`, en `PublicItem` (tras `sourcesCount?: number;`, línea 53):

  ```ts
  // Clase canónica del status (solo desaparecidos; snapshots viejos no la traen).
  statusClass?: "buscando" | "localizado";
  ```

  Sin cambio de comportamiento en el bot en este PR (solo el tipo, como pide el spec).

- [ ] **Verde total backend:** `npm test --workspace @venezuelahelp/backend` → suite completa verde. `npm run build --workspace @venezuelahelp/backend` compila.

- [ ] **Commit:**

  ```bash
  git add backend/src/shared/types.ts backend/src/enrichment/index.ts backend/src/telegram/types.ts backend/src/enrichment/__tests__/index.test.ts backend/src/public-snapshot/__tests__/snapshot.test.ts
  git commit -m "✨ feat(enrichment): emite statusClass canónico en desaparecidos del snapshot"
  ```

---

## Task 2 — Frontend: tipo `Item.statusClass` + chip en lista y detalle

**Files:**

- `frontend-public/src/types.ts` — interfaz `Item` (líneas 15–40): campo `statusClass?`.
- `frontend-public/src/components/ItemList.tsx` — componente `StatusChip` nuevo (junto a `Corroboration`, línea 43); pintarlo en la meta de la fila (líneas 157–177) y en la meta del detalle (líneas 69–83).
- `frontend-public/src/components/ItemList.module.css` — clases `.statusChip` / `.statusLocated` (junto a `.corrobora`, línea 243).
- `frontend-public/src/components/__tests__/list.test.tsx` — tests nuevos.

**Interfaces:**

- Consumes: `Item.statusClass?: "buscando" | "localizado"` (nuevo). Iconos: `CheckCircle` ya importado en `ItemList.tsx:3`.
- Produces: `StatusChip({ item }: { item: Item })` — chip verde "✓ Localizado" (`CheckCircle` + texto "Localizado") o neutro "Buscando"; `null` si `statusClass` ausente. Se renderiza en fila y detalle antes de `<Corroboration>`.

### Steps

- [ ] **Test rojo.** Añadir en `frontend-public/src/components/__tests__/list.test.tsx` (el archivo ya importa `render, screen, within` de testing-library, `userEvent` y el fixture `items`; `items[1]` es el desaparecido "Busco a María Rodríguez"):

  ```tsx
  describe("ItemList statusClass", () => {
    it('muestra "Localizado" (verde) cuando statusClass="localizado"', () => {
      render(<ItemList items={[{ ...items[1], statusClass: "localizado" }]} />);
      expect(screen.getByText("Localizado")).toBeInTheDocument();
    });

    it('muestra "Buscando" (neutro) cuando statusClass="buscando"', () => {
      render(<ItemList items={[{ ...items[1], statusClass: "buscando" }]} />);
      expect(screen.getByText("Buscando")).toBeInTheDocument();
    });

    it("no muestra chip sin statusClass (snapshot viejo o status no mapeado)", () => {
      render(<ItemList items={[items[1]]} />);
      expect(screen.queryByText("Localizado")).toBeNull();
      expect(screen.queryByText("Buscando")).toBeNull();
    });

    it("el detalle también muestra el chip al abrir la ficha", async () => {
      render(<ItemList items={[{ ...items[1], statusClass: "buscando" }]} />);
      await userEvent.click(
        screen.getByRole("button", { name: /Busco a María Rodríguez/i }),
      );
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Buscando")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Correr y ver el fallo:**

  ```bash
  npm test --workspace @venezuelahelp/frontend-public -- list
  ```

  Esperado: error de tipo TS (`statusClass` no existe en `Item`) y/o `Unable to find an element with the text: Localizado`.

- [ ] **Implementación mínima.**

  1. `frontend-public/src/types.ts` — en `Item`, tras `dupOf?: string;`:

  ```ts
  /** Clase canónica del status (solo desaparecidos; emitida por el enrichment
   *  del backend). El frontend NUNCA parsea `status` crudo: usa solo este campo.
   *  Ausente en snapshots viejos → feature-detect. */
  statusClass?: "buscando" | "localizado";
  ```

  2. `frontend-public/src/components/ItemList.tsx` — debajo de `Corroboration` (línea 55):

  ```tsx
  // Chip de estado (solo desaparecidos): el backend emite statusClass canónico
  // (classifyLocated); aquí no se interpreta el status crudo de la fuente.
  function StatusChip({ item }: { item: Item }) {
    if (item.statusClass === "localizado") {
      return (
        <span className={`${styles.statusChip} ${styles.statusLocated}`}>
          <CheckCircle aria-hidden="true" size={13} weight="fill" />
          Localizado
        </span>
      );
    }
    if (item.statusClass === "buscando") {
      return <span className={styles.statusChip}>Buscando</span>;
    }
    return null;
  }
  ```

  3. En la meta de la fila (dentro de `<div className={styles.meta}>`, justo antes de `<Corroboration item={item} />`, línea 176):

  ```tsx
  <StatusChip item={item} />
  ```

  4. En la meta del detalle (dentro de `<div className={styles.detailMeta}>`, justo antes de `<Corroboration item={item} />`, línea 82):

  ```tsx
  <StatusChip item={item} />
  ```

  5. `frontend-public/src/components/ItemList.module.css` — debajo del bloque `.corrobora` (línea 255):

  ```css
  /* Chip de estado (desaparecidos): verde = localizado, neutro = buscando.
     Mismos trazos que .corrobora para consistencia visual. */
  .statusChip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 1px 8px;
    white-space: nowrap;
  }

  .statusLocated {
    color: #067647;
    background: #ecfdf3;
    border-color: #abefc6;
  }
  ```

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public -- list` y después la suite completa `npm test --workspace @venezuelahelp/frontend-public`.

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/types.ts frontend-public/src/components/ItemList.tsx frontend-public/src/components/ItemList.module.css frontend-public/src/components/__tests__/list.test.tsx
  git commit -m "✨ feat(frontend-public): chip Localizado/Buscando por statusClass en lista y detalle"
  ```

---

## Task 3 — Frontend: sub-filtro "Todos / Buscando / Localizados" con feature-detect

**Files:**

- `frontend-public/src/types.ts` — tipo `StatusFilter` nuevo.
- `frontend-public/src/data/filter.ts` — `filterItems` gana 4º parámetro opcional `status` (líneas 22–36); helper nuevo `hasStatusClass`.
- `frontend-public/src/components/FilterBar.tsx` — 3 props opcionales nuevas + grupo de botones (tras `<CategoryFilter …/>`, línea 52).
- `frontend-public/src/components/FilterBar.module.css` — clases `.statusGroup` / `.statusBtn` / `.statusBtnActive`.
- `frontend-public/src/App.tsx` — estado `statusFilter`, reset en `onClear`/`onToggle`/`onToggleMatch`, cableado a las DOS instancias de `FilterBar` (líneas 177–190 y 199–211) y a `filterItems` (línea 150) + `filterKey` (línea 154).
- `frontend-public/src/data/__tests__/filter.test.ts` y `frontend-public/src/__tests__/app.test.tsx` — tests.

**Interfaces:**

- Produces (`types.ts`): `export type StatusFilter = "todos" | "buscando" | "localizado";`
- Produces (`filter.ts`):
  - `filterItems(items: Item[], query: string, active: Set<Category>, status: StatusFilter = "todos"): Item[]` — orden de aplicación: categoría → status → query. Con `status !== "todos"`, un ítem de `desaparecidos` pasa solo si `statusClass === status` (sin `statusClass` NO pasa); los ítems de otras categorías pasan intactos.
  - `hasStatusClass(items: Item[]): boolean` — feature-detect (`some(i => i.statusClass !== undefined)`).
- Produces (`FilterBar`): props opcionales `statusFilter?: StatusFilter` (default `"todos"`), `onStatusFilter?: (s: StatusFilter) => void`, `showStatusFilter?: boolean` (default `false`) — opcionales para no romper los tests/renderes existentes de `FilterBar`. El grupo se pinta solo si `showStatusFilter && onStatusFilter`.
- App decide la visibilidad: `showStatusFilter = active.has("desaparecidos") && snapshotHasStatus` donde `snapshotHasStatus = hasStatusClass(items)` (calculado en la IIFE junto a `catCounts`; en la Task 4 se memoiza).

### Steps

- [ ] **Test rojo (filter.ts).** Añadir en `frontend-public/src/data/__tests__/filter.test.ts`, dentro del `describe("filter functions")` (importar además `hasStatusClass` desde `"../filter"` y `StatusFilter` no hace falta):

  ```ts
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
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- filter` → falla (TS: `hasStatusClass` no exportado / 4º argumento inexistente).

- [ ] **Implementación mínima (datos).**

  1. `frontend-public/src/types.ts`:

  ```ts
  /** Sub-filtro de status para la categoría desaparecidos. */
  export type StatusFilter = "todos" | "buscando" | "localizado";
  ```

  2. `frontend-public/src/data/filter.ts` — importar el tipo (`import type { Category, Item, Snapshot, StatusFilter } from "@/types";`) y reemplazar `filterItems`:

  ```ts
  // Filtra por categorías activas (multi-select) + sub-filtro de status
  // (desaparecidos) + query con el MISMO ranking que el bot/API. Sin query,
  // mantiene el orden de `flatten`. El status compara SOLO statusClass (campo
  // canónico del enrichment); nunca se parsea el status crudo aquí.
  export function filterItems(
    items: Item[],
    query: string,
    active: Set<Category>,
    status: StatusFilter = "todos",
  ): Item[] {
    const byCat =
      active.size > 0 ? items.filter((i) => active.has(i.category)) : items;
    const byStatus =
      status === "todos"
        ? byCat
        : byCat.filter(
            (i) => i.category !== "desaparecidos" || i.statusClass === status,
          );
    if (!query.trim()) return byStatus;
    // searchItems espera un Snapshot; envolvemos los ítems ya filtrados.
    const snap = {
      generatedAt: "",
      categories: groupByCategory(byStatus),
    };
    return searchItems(snap, { q: query }) as Item[];
  }

  /** Feature-detect: el snapshot vivo trae statusClass (los pre-deploy no). */
  export function hasStatusClass(items: Item[]): boolean {
    return items.some((i) => i.statusClass !== undefined);
  }
  ```

- [ ] **Verde parcial:** `npm test --workspace @venezuelahelp/frontend-public -- filter`.

- [ ] **Test rojo (App integración).** En `frontend-public/src/__tests__/app.test.tsx`: añadir `within` al import de testing-library (línea 1) y estos tests al final del `describe("App integration")` (el fixture `SNAPSHOT` NO se toca: sirve para el caso feature-detect-negativo):

  ```tsx
  const SNAPSHOT_STATUS: Snapshot = {
    ...SNAPSHOT,
    categories: {
      ...SNAPSHOT.categories,
      desaparecidos: [
        {
          ...SNAPSHOT.categories.desaparecidos[0],
          statusClass: "buscando",
        },
        {
          category: "desaparecidos",
          sourceId: "src-2",
          externalId: "ext-9",
          titulo: "Pedro Gomez localizado",
          texto: "Reportado a salvo en Caracas.",
          statusClass: "localizado",
        },
      ],
    },
  };

  // Chips de categoría = botones con aria-pressed (los badges de la lista son spans).
  function desaparecidosChips() {
    return screen
      .getAllByRole("button", { name: /Desaparecidos/i })
      .filter((btn) => btn.getAttribute("aria-pressed") !== null);
  }

  it("muestra el sub-filtro de status solo con desaparecidos activa", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT_STATUS,
      loading: false,
      error: null,
    });
    render(<App />);
    expect(screen.queryByRole("group", { name: /por estado/i })).toBeNull();

    await userEvent.click(desaparecidosChips()[0]);
    expect(
      screen.getAllByRole("group", { name: /por estado/i }).length,
    ).toBeGreaterThan(0);

    // Desactivar la categoría lo oculta de nuevo.
    await userEvent.click(desaparecidosChips()[0]);
    expect(screen.queryByRole("group", { name: /por estado/i })).toBeNull();
  });

  it("filtra por Localizados dentro de desaparecidos", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT_STATUS,
      loading: false,
      error: null,
    });
    render(<App />);
    await userEvent.click(desaparecidosChips()[0]);

    const group = screen.getAllByRole("group", { name: /por estado/i })[0];
    await userEvent.click(
      within(group).getByRole("button", { name: "Localizados" }),
    );

    await waitFor(() => {
      expect(
        screen.queryAllByText("Persona desaparecida en Valencia"),
      ).toHaveLength(0);
    });
    expect(
      screen.getAllByText("Pedro Gomez localizado").length,
    ).toBeGreaterThan(0);
  });

  it("feature-detect: snapshot sin statusClass no muestra el sub-filtro", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);
    await userEvent.click(desaparecidosChips()[0]);
    expect(screen.queryByRole("group", { name: /por estado/i })).toBeNull();
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- app` → `Unable to find role="group" and name /por estado/i`.

- [ ] **Implementación mínima (UI).**

  1. `frontend-public/src/components/FilterBar.tsx` — importar `StatusFilter` (`import type { Category, StatusFilter } from "@/types";`), ampliar `FilterBarProps` con:

  ```ts
  /** Sub-filtro de status (solo con desaparecidos activa y snapshot con statusClass). */
  statusFilter?: StatusFilter;
  onStatusFilter?: (s: StatusFilter) => void;
  showStatusFilter?: boolean;
  ```

  desestructurar con defaults `statusFilter = "todos"`, `showStatusFilter = false`, y renderizar entre `<CategoryFilter …/>` y `<div className={styles.results}>`:

  ```tsx
  {
    showStatusFilter && onStatusFilter && (
      <div
        className={styles.statusGroup}
        role="group"
        aria-label="Filtrar desaparecidos por estado"
      >
        {(
          [
            ["todos", "Todos"],
            ["buscando", "Buscando"],
            ["localizado", "Localizados"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`${styles.statusBtn} ${
              statusFilter === value ? styles.statusBtnActive : ""
            }`}
            aria-pressed={statusFilter === value}
            onClick={() => onStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  ```

  2. `frontend-public/src/components/FilterBar.module.css` — al final:

  ```css
  /* ── Sub-filtro por estado (desaparecidos) ────────────────────── */

  .statusGroup {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .statusBtn {
    appearance: none;
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
  }

  .statusBtnActive {
    color: var(--primary-strong);
    border-color: var(--primary);
    background: color-mix(in oklab, var(--primary) 10%, white);
  }

  .statusBtn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  ```

  3. `frontend-public/src/App.tsx`:
     - Import: `import type { Category, StatusFilter } from "@/types";` y `hasStatusClass` en el import de `@/data/filter`.
     - Estado (junto a `matchView`, línea 41): `const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");`
     - `onToggle` (línea 70): antes del `setActive`, resetear si se está desactivando desaparecidos:

       ```ts
       if (cat === "desaparecidos" && active.has(cat)) setStatusFilter("todos");
       ```

     - `onToggleMatch` (línea 86): dentro del `if (next)` añadir `setStatusFilter("todos");`
     - `onClear` (línea 97): añadir `setStatusFilter("todos");`
     - En la IIFE (línea 148): `const snapshotHasStatus = hasStatusClass(items);` y `const filtered = filterItems(items, query, active, statusFilter);` y `const filterKey = `${query}|${[...active].sort().join(",")}|${statusFilter}`;`
     - En **ambas** instancias de `<FilterBar …>` (líneas 177–190 y 199–211) añadir:

       ```tsx
       statusFilter={statusFilter}
       onStatusFilter={setStatusFilter}
       showStatusFilter={active.has("desaparecidos") && snapshotHasStatus}
       ```

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public` — suite completa (los tests viejos de FilterBar/filters no cambian: props opcionales).

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/types.ts frontend-public/src/data/filter.ts frontend-public/src/components/FilterBar.tsx frontend-public/src/components/FilterBar.module.css frontend-public/src/App.tsx frontend-public/src/data/__tests__/filter.test.ts frontend-public/src/__tests__/app.test.tsx
  git commit -m "✨ feat(frontend-public): sub-filtro Todos/Buscando/Localizados con feature-detect"
  ```

---

## Task 4 — Frontend: selector de ordenación (Relevancia / Más recientes / Más corroborados)

**Files:**

- `frontend-public/src/types.ts` — tipo `SortMode`.
- `frontend-public/src/data/filter.ts` — `sortItems` nuevo.
- `frontend-public/src/App.tsx` — estado `sort`; **hoisting a `useMemo`** de `items`/`catCounts`/`snapshotHasStatus`/`filtered`/`sorted` (hoy todo se recalcula en la IIFE de las líneas 147–156 en cada render); las listas/mapas pasan a consumir `sorted`.
- `frontend-public/src/components/FilterBar.tsx` + `.module.css` — `<select>` de ordenación en la fila `.results` (líneas 54–75).
- `frontend-public/src/data/__tests__/filter.test.ts` y `frontend-public/src/__tests__/app.test.tsx` — tests.

**Interfaces:**

- Produces (`types.ts`): `export type SortMode = "relevancia" | "recientes" | "corroborados";`
- Produces (`filter.ts`): `sortItems(items: Item[], sort: SortMode): Item[]` — `"relevancia"` devuelve la MISMA referencia (orden actual: flatten/ranking de búsqueda); `"recientes"` copia ordenada por `lastSeenAt` desc (ISO compara lexicográficamente; ausente → `""` al final); `"corroborados"` por `sourcesCount ?? 0` desc con empate por `lastSeenAt` desc. Nunca muta la entrada.
- Produces (`FilterBar`): props opcionales `sort?: SortMode` (default `"relevancia"`) y `onSort?: (s: SortMode) => void`; el `<select aria-label="Ordenar resultados">` se pinta en la fila `.results` solo si `onSort` existe y `!matchActive`.
- App: `const sorted = useMemo(() => sortItems(filtered, sort), [filtered, sort]);` — `sorted` alimenta `InfiniteList`, `MapView`, `MapOverlay` y `located`; `filterKey` gana `|${sort}` para reiniciar la lista infinita al reordenar.

### Steps

- [ ] **Test rojo (sortItems).** En `frontend-public/src/data/__tests__/filter.test.ts` (importar `sortItems` desde `"../filter"`):

  ```ts
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
        sortItems([it2, it1, it4, it3], "corroborados").map(
          (i) => i.externalId,
        ),
      ).toEqual(["4", "1", "2", "3"]);
    });

    it("no muta la entrada", () => {
      const arr = [it1, it2];
      sortItems(arr, "recientes");
      expect(arr.map((i) => i.externalId)).toEqual(["1", "2"]);
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- filter` → `sortItems is not a function` / error TS.

- [ ] **Implementación mínima (datos).**

  1. `frontend-public/src/types.ts`:

  ```ts
  /** Ordenación client-side de los resultados. */
  export type SortMode = "relevancia" | "recientes" | "corroborados";
  ```

  2. `frontend-public/src/data/filter.ts` (añadir `SortMode` al import de tipos):

  ```ts
  // Ordenación client-side. "relevancia" preserva el orden actual (flatten /
  // ranking de búsqueda); las otras copian el array (nunca mutan la entrada).
  export function sortItems(items: Item[], sort: SortMode): Item[] {
    if (sort === "relevancia") return items;
    const byDate = (a: Item, b: Item) =>
      (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
    if (sort === "recientes") return [...items].sort(byDate);
    return [...items].sort((a, b) => {
      const d = (b.sourcesCount ?? 0) - (a.sourcesCount ?? 0);
      return d !== 0 ? d : byDate(a, b);
    });
  }
  ```

- [ ] **Verde parcial:** `npm test --workspace @venezuelahelp/frontend-public -- filter`.

- [ ] **Test rojo (App).** En `app.test.tsx`:

  ```tsx
  it("ordena por 'Más recientes' con el selector", async () => {
    const snap: Snapshot = {
      ...SNAPSHOT,
      categories: {
        ...SNAPSHOT.categories,
        reportes: [
          {
            ...SNAPSHOT.categories.reportes[0],
            lastSeenAt: "2026-06-28T00:00:00Z",
          },
        ],
        desaparecidos: [
          {
            ...SNAPSHOT.categories.desaparecidos[0],
            lastSeenAt: "2026-07-01T00:00:00Z",
          },
        ],
      },
    };
    mockUseSnapshot.mockReturnValue({
      data: snap,
      loading: false,
      error: null,
    });
    render(<App />);

    // Orden por defecto (relevancia = orden de flatten): reportes primero.
    let rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain("Edificio colapsado en Caracas");

    const select = screen.getAllByRole("combobox", {
      name: /ordenar resultados/i,
    })[0];
    await userEvent.selectOptions(select, "recientes");

    await waitFor(() => {
      rows = screen.getAllByRole("listitem");
      expect(rows[0].textContent).toContain("Persona desaparecida en Valencia");
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- app` → `Unable to find role="combobox"`.

- [ ] **Implementación mínima (UI + memoización).**

  1. `frontend-public/src/components/FilterBar.tsx` — props opcionales nuevas (`sort?: SortMode; onSort?: (s: SortMode) => void;`, default `sort = "relevancia"`; añadir `SortMode` al import de tipos). En la fila `.results`, tras `<p className={styles.resultsCount}>…</p>` y antes del botón `.clear`:

  ```tsx
  {
    !matchActive && onSort && (
      <label className={styles.sortLabel}>
        Ordenar:
        <select
          className={styles.sortSelect}
          aria-label="Ordenar resultados"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortMode)}
        >
          <option value="relevancia">Relevancia</option>
          <option value="recientes">Más recientes</option>
          <option value="corroborados">Más corroborados</option>
        </select>
      </label>
    );
  }
  ```

  2. `FilterBar.module.css`:

  ```css
  /* ── Selector de ordenación ───────────────────────────────────── */

  .sortLabel {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8125rem;
    color: var(--muted);
  }

  .sortSelect {
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 6px 8px;
  }

  .sortSelect:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  ```

  3. `frontend-public/src/App.tsx` — refactor de derivados (el spec exige memoización; hoy la IIFE recalcula `flatten` sobre ~66k ítems en cada render):
     - Imports: añadir `useMemo` a react; `sortItems` y `SortMode` a los imports.
     - Estado: `const [sort, setSort] = useState<SortMode>("relevancia");`
     - **Antes del `return`** (nivel superior del componente, hooks incondicionales):

       ```tsx
       // Derivados memoizados: flatten/filtrado/orden sobre ~66k ítems canónicos
       // no deben recalcularse en cada render (spec E4/E5).
       const items = useMemo(() => (data ? flatten(data) : []), [data]);
       const catCounts = useMemo(() => countByCategory(items), [items]);
       const snapshotHasStatus = useMemo(() => hasStatusClass(items), [items]);
       const filtered = useMemo(
         () => filterItems(items, query, active, statusFilter),
         [items, query, active, statusFilter],
       );
       const sorted = useMemo(
         () => sortItems(filtered, sort),
         [filtered, sort],
       );
       const located = useMemo(
         () => sorted.filter((it) => it.ubicacion != null),
         [sorted],
       );
       ```

     - En la IIFE (líneas 147–156): borrar las declaraciones locales de `items`, `catCounts`, `filtered`, `located`, `snapshotHasStatus` (usan las memoizadas) y dejar `filterKey` como:

       ```ts
       const filterKey = `${query}|${[...active].sort().join(",")}|${statusFilter}|${sort}`;
       ```

     - Sustituir consumidores de `filtered` por `sorted`: `<InfiniteList key={filterKey} items={sorted} />`, `<MapView items={sorted} …/>`, `<MapOverlay items={sorted} …/>`. (`resultCount={filtered.length}` puede quedarse: misma longitud.)
     - En ambas `<FilterBar …>`: `sort={sort}` y `onSort={setSort}`.

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public` — suite completa (verificar que los tests existentes de App siguen verdes tras el hoisting).

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/types.ts frontend-public/src/data/filter.ts frontend-public/src/components/FilterBar.tsx frontend-public/src/components/FilterBar.module.css frontend-public/src/App.tsx frontend-public/src/data/__tests__/filter.test.ts frontend-public/src/__tests__/app.test.tsx
  git commit -m "✨ feat(frontend-public): selector de ordenación memoizado (relevancia/recientes/corroborados)"
  ```

---

## Task 5 — Frontend: debounce ~300 ms en la búsqueda

**Files:**

- `frontend-public/src/hooks/useDebouncedValue.ts` — hook nuevo.
- `frontend-public/src/hooks/__tests__/useDebouncedValue.test.ts` — test nuevo (directorio nuevo `hooks/__tests__/`).
- `frontend-public/src/App.tsx` — usar el valor debounced en el filtrado.
- `frontend-public/src/__tests__/app.test.tsx` — endurecer aserciones negativas (ahora el filtrado llega 300 ms tarde).

**Interfaces:**

- Produces: `useDebouncedValue<T>(value: T, delayMs = 300): T`.
- App: el input sigue controlado por `query` (tecleo instantáneo); `const debouncedQuery = useDebouncedValue(query, 300);` alimenta `filtered` (useMemo) y `filterKey`. `FilterBar` sigue recibiendo `query` crudo (el botón "Limpiar filtros" responde al instante).

### Steps

- [ ] **Test rojo (hook).** Crear `frontend-public/src/hooks/__tests__/useDebouncedValue.test.ts`:

  ```ts
  import { renderHook, act } from "@testing-library/react";
  import { vi } from "vitest";
  import { useDebouncedValue } from "@/hooks/useDebouncedValue";

  describe("useDebouncedValue", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("devuelve el valor inicial de inmediato", () => {
      const { result } = renderHook(() => useDebouncedValue("a", 300));
      expect(result.current).toBe("a");
    });

    it("retrasa la actualización delayMs", () => {
      const { result, rerender } = renderHook(
        ({ v }) => useDebouncedValue(v, 300),
        { initialProps: { v: "a" } },
      );
      rerender({ v: "ab" });
      expect(result.current).toBe("a");
      act(() => vi.advanceTimersByTime(299));
      expect(result.current).toBe("a");
      act(() => vi.advanceTimersByTime(1));
      expect(result.current).toBe("ab");
    });

    it("reinicia el temporizador con cada cambio (solo aplica el último valor)", () => {
      const { result, rerender } = renderHook(
        ({ v }) => useDebouncedValue(v, 300),
        { initialProps: { v: "a" } },
      );
      rerender({ v: "ab" });
      act(() => vi.advanceTimersByTime(200));
      rerender({ v: "abc" });
      act(() => vi.advanceTimersByTime(200));
      expect(result.current).toBe("a");
      act(() => vi.advanceTimersByTime(100));
      expect(result.current).toBe("abc");
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- useDebouncedValue` → `Cannot find module '@/hooks/useDebouncedValue'`.

- [ ] **Implementación mínima.** Crear `frontend-public/src/hooks/useDebouncedValue.ts`:

  ```ts
  import { useEffect, useState } from "react";

  /**
   * Devuelve `value` con un retraso de `delayMs`. Evita recalcular el filtrado
   * sobre ~66k ítems canónicos en cada tecla de la búsqueda (spec E5).
   */
  export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delayMs);
      return () => clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
  }
  ```

- [ ] **Verde parcial:** `npm test --workspace @venezuelahelp/frontend-public -- useDebouncedValue`.

- [ ] **Cablear en App + endurecer tests.**

  1. `App.tsx`: `import { useDebouncedValue } from "@/hooks/useDebouncedValue";`, luego junto al estado:

  ```ts
  // La búsqueda filtra ~66k ítems: debounce para no recalcular por tecla.
  const debouncedQuery = useDebouncedValue(query, 300);
  ```

  y usar `debouncedQuery` (en vez de `query`) en: el `useMemo` de `filtered` (valor y deps) y en `filterKey`. El input y `hasFilters` de FilterBar siguen con `query` crudo.

  2. `app.test.tsx` — el test `"filters items when user types a query"` tiene la aserción negativa FUERA del `waitFor` (líneas 148–151); con debounce la positiva ("Edificio colapsado…" visible) es cierta ANTES de filtrar → la negativa quedaría flaky. Moverla dentro de un `waitFor`:

  ```tsx
  await waitFor(() => {
    expect(
      screen.queryAllByText("Persona desaparecida en Valencia"),
    ).toHaveLength(0);
  });
  ```

  Revisar igualmente el test de la Task 3 `"filtra por Localizados…"` (su negativa ya está en `waitFor`, no cambia) y `"se combina con la búsqueda"`-style tests: cualquier aserción que dependa de un tecleo debe quedar dentro de `waitFor` (timeout default 1000 ms > 300 ms, sin fake timers).

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public` — suite completa, correrla DOS veces para descartar flakiness del debounce.

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/hooks/useDebouncedValue.ts frontend-public/src/hooks/__tests__/useDebouncedValue.test.ts frontend-public/src/App.tsx frontend-public/src/__tests__/app.test.tsx
  git commit -m "⚡ perf(frontend-public): debounce de 300ms en la búsqueda de FilterBar"
  ```

---

## Task 6 — Frontend: detalle con "Actualizado: …" y "Estado según la fuente: …"

**Files:**

- `frontend-public/src/components/ItemList.tsx` — `ItemDetail` (líneas 57–112).
- `frontend-public/src/components/ItemList.module.css` — clase `.detailStatus`.
- `frontend-public/src/components/__tests__/list.test.tsx` — tests.

**Interfaces:**

- Consumes: `formatDateTime(iso?: string): string | null` (ya importado en ItemList desde `@/data/datetime`); `Item.lastSeenAt?`, `Item.status?` (ya en el tipo).
- Produces: en `detailMeta`, un span "Actualizado: <fecha>" cuando `lastSeenAt` existe y su formato difiere del de `firstSeenAt` (si son idénticos, mostrar solo "Registrado" — sin ruido). Tras `detailText`, un párrafo "Estado según la fuente: <status crudo>" para TODAS las categorías cuando `item.status` no es vacío. Es texto informativo del origen; el chip canónico sigue siendo `StatusChip`.

### Steps

- [ ] **Test rojo.** En `list.test.tsx`:

  ```tsx
  describe("ItemDetail — Actualizado y status crudo", () => {
    it("muestra 'Actualizado:' cuando lastSeenAt difiere de firstSeenAt", async () => {
      render(
        <ItemList
          items={[
            {
              ...items[0],
              firstSeenAt: "2026-06-26T12:00:00Z",
              lastSeenAt: "2026-07-01T09:30:00Z",
            },
          ]}
        />,
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Edificio colapsado/i }),
      );
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(/Registrado:/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/Actualizado:/i)).toBeInTheDocument();
    });

    it("omite 'Actualizado:' cuando coincide con la fecha de registro", async () => {
      render(
        <ItemList
          items={[
            {
              ...items[0],
              firstSeenAt: "2026-06-26T12:00:00Z",
              lastSeenAt: "2026-06-26T12:00:00Z",
            },
          ]}
        />,
      );
      await userEvent.click(
        screen.getByRole("button", { name: /Edificio colapsado/i }),
      );
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).queryByText(/Actualizado:/i)).toBeNull();
    });

    it("muestra el status crudo de la fuente en cualquier categoría", async () => {
      render(<ItemList items={[{ ...items[0], status: "en_revision" }]} />);
      await userEvent.click(
        screen.getByRole("button", { name: /Edificio colapsado/i }),
      );
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByText(/Estado según la fuente:/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("en_revision")).toBeInTheDocument();
    });

    it("omite la fila de status crudo cuando la fuente no lo trae", async () => {
      render(<ItemList items={[items[0]]} />);
      await userEvent.click(
        screen.getByRole("button", { name: /Edificio colapsado/i }),
      );
      expect(screen.queryByText(/Estado según la fuente:/i)).toBeNull();
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- list` → `Unable to find … /Actualizado:/`.

- [ ] **Implementación mínima.** En `ItemDetail`:

  1. Junto a `const fecha = formatDateTime(item.firstSeenAt);` (línea 58):

  ```tsx
  const actualizado = formatDateTime(item.lastSeenAt);
  ```

  2. En `detailMeta`, tras el span de "Registrado" (líneas 70–75):

  ```tsx
  {
    actualizado && actualizado !== fecha && (
      <span className={styles.detailMetaItem}>
        <Clock aria-hidden="true" size={14} />
        Actualizado: {actualizado}
      </span>
    );
  }
  ```

  3. Tras `{item.texto && <p className={styles.detailText}>{item.texto}</p>}` (línea 104):

  ```tsx
  {
    item.status && (
      <p className={styles.detailStatus}>
        Estado según la fuente: <strong>{item.status}</strong>
      </p>
    );
  }
  ```

  4. `ItemList.module.css` (junto a los estilos de detalle):

  ```css
  /* Status crudo tal como lo reporta la fuente (informativo, sin normalizar). */
  .detailStatus {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--muted);
  }

  .detailStatus strong {
    color: var(--ink);
    font-weight: 600;
  }
  ```

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public -- list` y suite completa.

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/components/ItemList.tsx frontend-public/src/components/ItemList.module.css frontend-public/src/components/__tests__/list.test.tsx
  git commit -m "✨ feat(frontend-public): detalle con Actualizado (lastSeenAt) y status crudo de la fuente"
  ```

---

## Task 7 — Frontend: deeplink `#/item/<sourceId>/<externalId>` + botón "Copiar enlace"

**La tarea más delicada.** Cómo funciona el router actual de `App.tsx` (no hay `parseHash`; es estado + comparación exacta):

1. **Estado** (líneas 43–45): `const [route, setRoute] = useState<string>(typeof window !== "undefined" ? window.location.hash : "");` — el hash inicial ya está en el primer render (un deeplink abierto en frío no necesita evento).
2. **Suscripción** (líneas 61–68): un `useEffect` escucha `hashchange`, hace `setRoute(window.location.hash)` y `window.scrollTo(0, 0)`.
3. **Flags de página** (líneas 103–107): `const isAbout = route === "#/quienes-somos";` etc. — comparaciones **exactas** contra `#/quienes-somos`, `#/interpretes`, `#/api`, `#/api-docs`, `#/fuentes`.
4. **Render** (líneas 115–287): cadena de ternarios `isAbout ? … : isApiDocs ? … : … : isFuentes ? … : (<home/>)`. **Cualquier hash que no coincida con un flag cae en la rama home** — por eso `#/item/...` renderiza la home sin tocar ninguna página existente, y solo hay que superponer el modal.

**Decisiones de integración (para no romper nada):**

- El modal de deeplink vive en **App** (no en `ItemList`): App parsea `route`, resuelve el ítem contra el snapshot y renderiza `ItemDetail` (que se exporta desde `ItemList.tsx`). El modal local de `ItemList` (estado `selected`) **no cambia**: navegar la lista no toca el hash (así el `window.scrollTo(0,0)` del listener jamás interfiere con el scroll del usuario). El botón "Copiar enlace" construye la URL él mismo con `itemHash(item)` — funciona igual en el modal local y en el de deeplink.
- La búsqueda del ítem recorre **todas** las categorías del snapshot SIN colapsar duplicados (`snap.categories`, no `flatten`): un enlace compartido a una ficha que luego quedó marcada duplicada debe seguir resolviendo.
- Cerrar el modal hace `window.location.hash = "#/"` → dispara `hashchange` → `setRoute` → el modal desaparece y queda la home (`#/` no coincide con ningún flag).
- Ficha inexistente: banner `role="alert"` "No encontramos esa ficha…" sobre la home normal, con botón que limpia el hash.

**Files:**

- `frontend-public/src/data/route.ts` — módulo nuevo: `parseItemRoute`, `itemHash`, `findItem`.
- `frontend-public/src/data/__tests__/route.test.ts` — test nuevo.
- `frontend-public/src/components/ItemList.tsx` — exportar `ItemDetail`; añadir `CopyLinkButton` al pie del detalle.
- `frontend-public/src/components/ItemList.module.css` — `.copyLink` + `detailFoot` a flex.
- `frontend-public/src/App.tsx` — resolver el deeplink y renderizar modal/banner en la rama home.
- `frontend-public/src/App.module.css` — `.deepMiss`.
- `frontend-public/src/__tests__/app.test.tsx` y `frontend-public/src/components/__tests__/list.test.tsx` — tests.

**Interfaces:**

- Produces (`route.ts`):
  - `parseItemRoute(hash: string): { sourceId: string; externalId: string } | null` — matchea `#/item/<seg1>/<resto>` con componentes URL-encoded; `null` para cualquier otra ruta o URI malformado.
  - `itemHash(it: Pick<Item, "sourceId" | "externalId">): string` — inverso (`encodeURIComponent` por componente).
  - `findItem(snap: Snapshot, sourceId: string, externalId: string): Item | null`.
- Produces (`ItemList.tsx`): `export function ItemDetail({ item, onClose }: { item: Item; onClose: () => void })` (hoy es privada, línea 57 — solo se antepone `export`).

### Steps

- [ ] **Test rojo (route.ts).** Crear `frontend-public/src/data/__tests__/route.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { parseItemRoute, itemHash, findItem } from "../route";
  import type { Snapshot } from "@/types";

  describe("parseItemRoute", () => {
    it("parsea #/item/<sourceId>/<externalId>", () => {
      expect(parseItemRoute("#/item/usgs/abc123")).toEqual({
        sourceId: "usgs",
        externalId: "abc123",
      });
    });

    it("decodifica componentes URL-encoded (ids compuestos a|b|c)", () => {
      expect(
        parseItemRoute("#/item/pacientesve/maria%7C12345%7Chospital%20vargas"),
      ).toEqual({
        sourceId: "pacientesve",
        externalId: "maria|12345|hospital vargas",
      });
    });

    it("devuelve null para las demás rutas del router", () => {
      for (const h of [
        "",
        "#/",
        "#/fuentes",
        "#/interpretes",
        "#/quienes-somos",
        "#/api",
        "#/api-docs",
        "#/item/soloUnSegmento",
      ]) {
        expect(parseItemRoute(h)).toBeNull();
      }
    });

    it("devuelve null ante un URI malformado en vez de lanzar", () => {
      expect(parseItemRoute("#/item/a/%E0%A4%A")).toBeNull();
    });

    it("itemHash es el inverso de parseItemRoute (roundtrip)", () => {
      const id = { sourceId: "sos/2026", externalId: "a|b/c d" };
      expect(parseItemRoute(itemHash(id))).toEqual(id);
    });
  });

  describe("findItem", () => {
    const snap: Snapshot = {
      generatedAt: "2026-07-02T00:00:00Z",
      categories: {
        reportes: [],
        desaparecidos: [
          {
            category: "desaparecidos",
            sourceId: "s1",
            externalId: "e1",
            titulo: "Maria Perez",
            texto: "t",
            isCanonical: false, // duplicado: flatten lo colapsa, findItem NO
          },
        ],
        acopios: [],
        edificios: [],
        solicitudes: [],
        hospitales: [],
      },
    };

    it("encuentra el ítem por identidad aunque sea un duplicado no canónico", () => {
      expect(findItem(snap, "s1", "e1")?.titulo).toBe("Maria Perez");
    });

    it("devuelve null si no existe", () => {
      expect(findItem(snap, "s1", "nope")).toBeNull();
      expect(findItem(snap, "otra", "e1")).toBeNull();
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- route` → `Cannot find module '../route'`.

- [ ] **Implementación mínima (route.ts).** Crear `frontend-public/src/data/route.ts`:

  ```ts
  import type { Item, Snapshot } from "@/types";

  /**
   * Parsea el deeplink "#/item/<sourceId>/<externalId>" (componentes
   * URL-encoded). Devuelve null para cualquier otra ruta del hash router de
   * App (#/fuentes, #/interpretes, …) — así la ruta nueva no interfiere con
   * las páginas existentes.
   */
  export function parseItemRoute(
    hash: string,
  ): { sourceId: string; externalId: string } | null {
    const m = /^#\/item\/([^/]+)\/(.+)$/.exec(hash);
    if (!m) return null;
    try {
      return {
        sourceId: decodeURIComponent(m[1]),
        externalId: decodeURIComponent(m[2]),
      };
    } catch {
      // URI malformado (p.ej. "%" suelto): tratar como ruta desconocida.
      return null;
    }
  }

  /** Hash del deeplink de un ítem (inverso de parseItemRoute). */
  export function itemHash(it: Pick<Item, "sourceId" | "externalId">): string {
    return `#/item/${encodeURIComponent(it.sourceId)}/${encodeURIComponent(
      it.externalId,
    )}`;
  }

  /**
   * Busca un ítem por identidad en TODO el snapshot, incluyendo duplicados no
   * canónicos: un enlace compartido debe resolver aunque el dedup colapse la
   * ficha en la lista.
   */
  export function findItem(
    snap: Snapshot,
    sourceId: string,
    externalId: string,
  ): Item | null {
    for (const items of Object.values(snap.categories)) {
      for (const it of items ?? []) {
        if (it.sourceId === sourceId && it.externalId === externalId) {
          return it;
        }
      }
    }
    return null;
  }
  ```

- [ ] **Verde parcial:** `npm test --workspace @venezuelahelp/frontend-public -- route`.

- [ ] **Test rojo (Copiar enlace).** En `list.test.tsx` (importar `vi` de vitest):

  ```tsx
  describe("ItemDetail — Copiar enlace", () => {
    it("copia el deeplink del ítem y confirma", async () => {
      const user = userEvent.setup();
      const writeText = vi.fn().mockResolvedValue(undefined);
      // Después de userEvent.setup(): pisa el stub de clipboard de user-event.
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      render(<ItemList items={[items[1]]} />);
      await user.click(
        screen.getByRole("button", { name: /Busco a María Rodríguez/i }),
      );
      await user.click(screen.getByRole("button", { name: /copiar enlace/i }));

      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("#/item/wa/202"),
      );
      expect(await screen.findByText("Enlace copiado")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- list` → `Unable to find role="button" and name /copiar enlace/i`.

- [ ] **Implementación mínima (ItemList).**

  1. `ItemList.tsx`: importar `LinkSimple` de `@phosphor-icons/react` (añadirlo al import existente) y `itemHash` de `@/data/route`. Exportar el detalle: `function ItemDetail` → `export function ItemDetail` (línea 57).

  2. Componente nuevo encima de `ItemDetail`:

  ```tsx
  // "Copiar enlace": deeplink #/item/<sourceId>/<externalId> del ítem.
  // navigator.clipboard con fallback a execCommand (http / navegadores viejos).
  function CopyLinkButton({ item }: { item: Item }) {
    const [copied, setCopied] = useState(false);

    async function copy() {
      const url = `${window.location.origin}${window.location.pathname}${itemHash(item)}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }

    return (
      <button type="button" className={styles.copyLink} onClick={copy}>
        <LinkSimple aria-hidden="true" size={14} weight="bold" />
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>
    );
  }
  ```

  3. En el pie del detalle (línea 106–109):

  ```tsx
  <div className={styles.detailFoot}>
    <Source sourceId={item.sourceId} sourceUrl={item.sourceUrl} />
    <CopyLinkButton item={item} />
  </div>
  ```

  4. `ItemList.module.css` — el `.detailFoot` actual (línea 236) no es flex; convertirlo y añadir `.copyLink`:

  ```css
  .detailFoot {
    width: 100%;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .copyLink {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    padding: 6px 4px;
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--primary);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    border-radius: 6px;
  }

  .copyLink:hover {
    color: var(--primary-strong);
  }

  .copyLink:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  ```

- [ ] **Verde parcial:** `npm test --workspace @venezuelahelp/frontend-public -- list`.

- [ ] **Test rojo (deeplink en App).** En `app.test.tsx` — añadir el reset del hash al `afterEach` existente (línea 89):

  ```tsx
  afterEach(() => {
    vi.clearAllMocks();
    window.location.hash = "";
  });
  ```

  y los tests:

  ```tsx
  describe("deeplink #/item", () => {
    it("abre la home con el modal de detalle de la ficha", async () => {
      window.location.hash = "#/item/src-2/ext-2";
      mockUseSnapshot.mockReturnValue({
        data: SNAPSHOT,
        loading: false,
        error: null,
      });
      render(<App />);
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText("Persona desaparecida en Valencia"),
      ).toBeInTheDocument();
      // La home sigue debajo (no es una página aparte).
      expect(screen.getByText(/Última actualización/i)).toBeInTheDocument();
    });

    it("ficha inexistente → aviso 'No encontramos esa ficha' + home normal", () => {
      window.location.hash = "#/item/src-x/no-existe";
      mockUseSnapshot.mockReturnValue({
        data: SNAPSHOT,
        loading: false,
        error: null,
      });
      render(<App />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        /No encontramos esa ficha/i,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        screen.getAllByText("Edificio colapsado en Caracas").length,
      ).toBeGreaterThan(0);
    });

    it("cerrar el modal restaura #/ y desmonta el detalle", async () => {
      window.location.hash = "#/item/src-2/ext-2";
      mockUseSnapshot.mockReturnValue({
        data: SNAPSHOT,
        loading: false,
        error: null,
      });
      render(<App />);
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(
        within(dialog).getByRole("button", { name: /cerrar/i }),
      );
      await waitFor(() => expect(window.location.hash).toBe("#/"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("no rompe las páginas existentes (#/fuentes sigue siendo Fuentes)", () => {
      window.location.hash = "#/fuentes";
      mockUseSnapshot.mockReturnValue({
        data: SNAPSHOT,
        loading: false,
        error: null,
      });
      render(<App />);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- app` → `Unable to find role="dialog"`.

- [ ] **Implementación mínima (App).**

  1. Imports: `import { parseItemRoute, findItem } from "@/data/route";` y `import { ItemDetail } from "@/components/ItemList";`
  2. Tras los flags de página (líneas 103–107):

  ```tsx
  // Deeplink por ítem: #/item/<sourceId>/<externalId>. No coincide con ningún
  // flag de página → App renderiza la rama home y superpone el modal.
  const itemRoute = parseItemRoute(route);
  const deepItem =
    itemRoute && data
      ? findItem(data, itemRoute.sourceId, itemRoute.externalId)
      : null;
  ```

  3. En la rama home, dentro del `<SourcesContext.Provider>` (el modal es un portal; el orden solo importa para el banner): el banner **antes de `<Hero …/>`** (los controles/filtros quedan debajo, lección `lesson_fixed-height-section-pushes-nav` no aplica: es una franja de texto, no un bloque de alto fijo):

  ```tsx
  {
    itemRoute && !deepItem && (
      <div className={styles.deepMiss} role="alert">
        <span>
          No encontramos esa ficha. Puede que la fuente la haya retirado o que
          el enlace esté incompleto.
        </span>
        <button
          type="button"
          onClick={() => {
            window.location.hash = "#/";
          }}
        >
          Entendido
        </button>
      </div>
    );
  }
  ```

  y junto a `<Footer />` (final del provider):

  ```tsx
  {
    deepItem && (
      <ItemDetail
        item={deepItem}
        onClose={() => {
          window.location.hash = "#/";
        }}
      />
    );
  }
  ```

  (Nota: `data` ya está garantizado no-nulo dentro de la IIFE, por eso el banner solo chequea `itemRoute && !deepItem`.)

  4. `App.module.css`:

  ```css
  /* Aviso de deeplink roto: franja sobria sobre la home. */
  .deepMiss {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin: 16px auto 0;
    max-width: 960px;
    padding: 12px 16px;
    font-size: 0.875rem;
    color: var(--ink);
    background: color-mix(in oklab, var(--primary) 8%, white);
    border: 1px solid var(--border-strong);
    border-radius: 10px;
  }

  .deepMiss button {
    appearance: none;
    background: transparent;
    border: none;
    padding: 6px 4px;
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--primary);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  ```

  5. **No tocar** el listener de `hashchange` (líneas 61–68): el `scrollTo(0,0)` está bien para deeplinks (se llega desde un enlace externo) y la navegación normal de la lista nunca cambia el hash.

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public` — suite completa. Verificar en particular que los tests preexistentes de páginas (`sourcesPage`, `apiDocsPage`, …) siguen verdes.

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/data/route.ts frontend-public/src/data/__tests__/route.test.ts frontend-public/src/components/ItemList.tsx frontend-public/src/components/ItemList.module.css frontend-public/src/App.tsx frontend-public/src/App.module.css frontend-public/src/__tests__/app.test.tsx frontend-public/src/components/__tests__/list.test.tsx
  git commit -m "✨ feat(frontend-public): deeplink #/item/<source>/<id> con modal y botón Copiar enlace"
  ```

---

## Task 8 — Frontend: empty state con "Limpiar filtros"

**Files:**

- `frontend-public/src/components/States.tsx` — `Empty` (líneas 25–33) gana `onClear?`.
- `frontend-public/src/components/States.module.css` — `.emptyClear`.
- `frontend-public/src/App.tsx` — pasar `onClear` cuando hay filtros activos (línea 227).
- `frontend-public/src/__tests__/app.test.tsx` — test.

**Interfaces:**

- Produces: `Empty({ query, onClear }: { query?: string; onClear?: () => void })` — botón "Limpiar filtros" solo si `onClear` viene. App lo pasa solo con filtros activos: `query.trim() || active.size > 0 || statusFilter !== "todos"` (reutiliza el `onClear` existente de App, que tras la Task 3 también resetea `statusFilter`).

### Steps

- [ ] **Test rojo.** En `app.test.tsx` (nota: FilterBar ya tiene su propio botón "Limpiar filtros" ×2 — el test cuenta que aparece UNO MÁS dentro del empty state y clica ese):

  ```tsx
  it("empty state con filtros ofrece 'Limpiar filtros' y restaura la lista", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);

    // Sin filtros: solo hay botones de limpiar de FilterBar cuando hay filtros
    // (hasFilters=false ⇒ 0 botones).
    expect(
      screen.queryAllByRole("button", { name: /limpiar filtros/i }),
    ).toHaveLength(0);

    const input = screen.getByRole("searchbox", { name: /buscar/i });
    await userEvent.type(input, "xyzzy-no-existe");

    const emptyMsg = await screen.findByText(/No hay resultados para/i);
    const emptyBtn = within(emptyMsg.parentElement as HTMLElement).getByRole(
      "button",
      { name: /limpiar filtros/i },
    );
    await userEvent.click(emptyBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText("Edificio colapsado en Caracas").length,
      ).toBeGreaterThan(0);
    });
    expect((input as HTMLInputElement).value).toBe("");
  });
  ```

- [ ] **Correr y ver el fallo:** `npm test --workspace @venezuelahelp/frontend-public -- app` → `Unable to find role="button" and name /limpiar filtros/i` (dentro del empty).

- [ ] **Implementación mínima.**

  1. `States.tsx`:

  ```tsx
  interface EmptyProps {
    query?: string;
    /** Con filtros activos: botón para limpiarlos y volver a ver todo. */
    onClear?: () => void;
  }

  export function Empty({ query, onClear }: EmptyProps) {
    return (
      <div className={styles.emptyRoot}>
        <p className={styles.emptyMessage}>
          {query ? `No hay resultados para «${query}».` : "No hay resultados."}
        </p>
        {onClear && (
          <button className={styles.emptyClear} type="button" onClick={onClear}>
            Limpiar filtros
          </button>
        )}
      </div>
    );
  }
  ```

  2. `States.module.css` (mismos trazos que `.retryBtn`):

  ```css
  .emptyClear {
    margin-top: 16px;
    padding: 8px 20px;
    border-radius: 10px;
    border: 1px solid var(--border-strong);
    background: var(--bg);
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .emptyClear:hover {
    background: var(--primary-tint);
    border-color: var(--primary);
  }

  .emptyClear:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  ```

  3. `App.tsx` — en la rama del empty (línea 227):

  ```tsx
  ) : filtered.length === 0 ? (
    <Empty
      query={debouncedQuery}
      onClear={
        debouncedQuery.trim().length > 0 ||
        active.size > 0 ||
        statusFilter !== "todos"
          ? onClear
          : undefined
      }
    />
  ) : (
  ```

- [ ] **Verde:** `npm test --workspace @venezuelahelp/frontend-public` — suite completa.

- [ ] **Commit:**

  ```bash
  git add frontend-public/src/components/States.tsx frontend-public/src/components/States.module.css frontend-public/src/App.tsx frontend-public/src/__tests__/app.test.tsx
  git commit -m "✨ feat(frontend-public): botón Limpiar filtros en el empty state con filtros activos"
  ```

---

## Task 9 — Verificación final

- [ ] **Suites completas** (desde la raíz del repo):

  ```bash
  npm test --workspace @venezuelahelp/backend
  npm test --workspace @venezuelahelp/frontend-public
  npm test --workspace @venezuelahelp/core
  ```

  Las tres verdes. `core` no se tocó — si algo falla ahí, se rompió el contrato estructural: revisar.

- [ ] **Builds** (el CI hace `test → build → cdk deploy --all`; verificar que compila igual que él):

  ```bash
  npm run build --workspace @venezuelahelp/backend
  npm run build --workspace @venezuelahelp/frontend-public
  ```

- [ ] **Smoke manual del deeplink y el feature-detect** (opcional pero recomendado — `feedback_validate-data-features-with-prod-smoke`): con el snapshot real (`npm run snapshot:pull --workspace @venezuelahelp/frontend-public` si hay red, o el `snap.gz` de un `curl` + `gunzip`), `npm run dev --workspace @venezuelahelp/frontend-public` y probar a mano: (1) `#/item/usgs/<id-real>` abre el modal, (2) `#/item/x/y` muestra el aviso, (3) el snapshot vivo AÚN no trae `statusClass` → el sub-filtro NO debe verse (feature-detect en acción); tras el deploy + siguiente scrape (~30 min) sí.

- [ ] **`git status` limpio** (lección del hack sin commitear): todo lo tocado está en commits; ningún archivo suelto.

- [ ] **Recordatorio de despliegue (para el PR):** stacks afectados = `VenezuelaHelpScraperStack` (enrichment corre dentro de `buildSnapshot`, invocado por el scraper — NO hay Lambda `public-snapshot` aparte) + `VenezuelaHelpFrontendStack` (público) + `VenezuelaHelpBotStack` (solo tipo, sin cambio de comportamiento). El merge a `main` lo despliega todo el CI. El `statusClass` aparece en el snapshot vivo en el siguiente scrape (~30 min máx; el scrape tarda ~11 min); mientras tanto el frontend feature-detecta y no muestra el sub-filtro.

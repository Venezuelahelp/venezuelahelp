# Conector centralizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la ingesta de todas las fuentes con un motor declarativo `rest` (config sin deploy), permalink por ítem (`sourceUrl`), observabilidad por endpoint, alta/edición desde el admin con "Probar", y arreglar `terremotovenezuela` + marcar las bloqueadas.

**Architecture:** Un motor `rest` parametrizado por `RestConfig` (en la `Source`) reemplaza los conectores hardcodeados, que pasan a ser **presets**. `sourceUrl` viaja end-to-end (tipos → upsert → snapshot → público → bot) sin tocar `snapshot.ts` (spread). El admin gana selector IA/API-JSON, dry-run `POST /sources/probe`, y status real en `/stats`.

**Tech Stack:** TypeScript strict, Zod, vitest, aws-sdk-client-mock, AWS CDK, React (Vite) frontends.

## Global Constraints

- TypeScript **strict**; imports con alias `@/` → `backend/src`.
- Variables de entorno validadas con **Zod**; sin `console.log` → logging estructurado (`@/shared/logger`, Powertools).
- **TDD**: test que falla → implementación mínima → verde → commit. Tests con `vitest`; correr backend con `npm test --workspace @venezuelahelp/backend` (la raíz rompe el alias `@/`).
- **Conventional Commits con emoji**: `<emoji> <tipo>(<scope>): <descripción imperativa>`.
- Rama: `feat/conector-centralizador`. Nunca commitear a `main`.
- Aislamiento por fuente: un fallo de fuente/endpoint **no** rompe las demás.
- Helper de URL existente: `imageUrl(base, url)` de `@/connectors/types` (resuelve relativas, descarta no-http(s)) — **reutilizar** para `sourceUrl`.

---

## FASE A — `sourceUrl` end-to-end

Recupera el "link directo de la fuente" por ítem. Bajo riesgo: solo agrega un campo opcional que fluye por spreads existentes.

### Task A1: Campo `sourceUrl` en los tipos backend

**Files:**

- Modify: `backend/src/shared/types.ts` (interface `NormalizedItem`)
- Test: `backend/src/shared/__tests__/types.test.ts` (crear si no existe; si el repo no testea tipos puros, omitir test y validar con `tsc`)

**Interfaces:**

- Produces: `NormalizedItem.sourceUrl?: string` (heredado por `StoredItem`).

- [ ] **Step 1: Añadir el campo**

En `NormalizedItem`, tras `imageUrl?: string;`:

```ts
  // URL absoluta http(s) del ítem en su origen (permalink). Preferimos el link
  // real que da la API (p.ej. el post de TikTok/IG); si la fuente no lo da, un
  // deep-link construido. Viaja en el snapshot (no se persiste `raw`).
  sourceUrl?: string;
```

- [ ] **Step 2: Verificar tipado**

Run: `npm run build --workspace @venezuelahelp/backend`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/types.ts
git commit -m "✨ feat(types): sourceUrl (permalink por ítem) en NormalizedItem"
```

### Task A2: Mapear `sourceUrl` en los conectores actuales

**Files:**

- Modify: `backend/src/connectors/sismovenezuela.ts` (función `reportes`)
- Modify: `backend/src/connectors/terremotovenezuela.ts` (`reports`, `desaparecidos`)
- Modify: `backend/src/connectors/ninosvenezuela.ts`, `backend/src/connectors/hospitalesvenezuela.ts` (vía template)
- Test: `backend/src/connectors/__tests__/sismovenezuela.test.ts` (+ los demás)

**Interfaces:**

- Consumes: `imageUrl(base, url)` (ya importado en cada conector).

- [ ] **Step 1: Test rojo — sismovenezuela emite `sourceUrl` desde `source_url`**

En `sismovenezuela.test.ts`, en el test de `reportes`, añadir aserción:

```ts
expect(reportItem.sourceUrl).toBe("https://vm.tiktok.com/ZNRwAxuN9/");
```

(Asegurar que el fixture `sismo_reports_feed.json` tenga `source_url` en una fila; si no, añadirlo.)

- [ ] **Step 2: Run → FAIL**

Run: `npm test --workspace @venezuelahelp/backend -- sismovenezuela`
Expected: FAIL (`sourceUrl` undefined).

- [ ] **Step 3: Implementar en `reportes` de sismovenezuela**

En el objeto retornado por `reportes`, añadir tras `imageUrl: …,`:

```ts
    sourceUrl: imageUrl(BASE, r.source_url),
```

- [ ] **Step 4: Run → PASS**

Run: `npm test --workspace @venezuelahelp/backend -- sismovenezuela`
Expected: PASS.

- [ ] **Step 5: Repetir para las demás fuentes**

`terremotovenezuela.reports` → `sourceUrl: imageUrl(BASE, \`/reportes/${r.id}\`)` (deep-link a la página del reporte; confirmar ruta real al re-descubrir la API en Fase C — por ahora deep-link a la home `/`). `terremotovenezuela.desaparecidos` → `sourceUrl: imageUrl(BASE, \`/desaparecidos/${m.id}\`)`. `ninosvenezuela`→`sourceUrl: imageUrl(BASE, \`/?id=${r.id}\`)`. `hospitalesvenezuela` → sin permalink fiable → omitir (cae a home vía snapshot.sources). Añadir/ajustar aserciones en cada test.

- [ ] **Step 6: Run toda la suite de conectores → PASS**

Run: `npm test --workspace @venezuelahelp/backend -- connectors`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/connectors
git commit -m "✨ feat(connectors): mapear sourceUrl (permalink) en cada fuente"
```

### Task A3: `sourceUrl` en el frontend público

**Files:**

- Modify: `frontend-public/src/types.ts` (interface `Item`)
- Modify: `frontend-public/src/components/Source.tsx` (prop `sourceUrl?`)
- Modify: `frontend-public/src/components/ItemList.tsx` (pasar `item.sourceUrl`)
- Test: `frontend-public/src/components/__tests__/source.test.tsx` (crear)

**Interfaces:**

- Produces: `Item.sourceUrl?: string`; `<Source sourceId sourceUrl? />`.

- [ ] **Step 1: Añadir el campo al `Item` público**

En `frontend-public/src/types.ts`, en `Item`, tras `imageUrl?`:

```ts
  /** URL absoluta del ítem en su origen (permalink). Cae a la home de la fuente si falta. */
  sourceUrl?: string;
```

- [ ] **Step 2: Test rojo — `Source` con `sourceUrl` enlaza al permalink**

```tsx
import { render, screen } from "@testing-library/react";
import Source from "@/components/Source";

it("enlaza al permalink del ítem cuando hay sourceUrl", () => {
  render(<Source sourceId="sismovenezuela" sourceUrl="https://tiktok.com/x" />);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("href", "https://tiktok.com/x");
  expect(link).toHaveTextContent(/ver original/i);
});
```

- [ ] **Step 3: Run → FAIL**

Run: `npm test --workspace @venezuelahelp/frontend-public -- source`
Expected: FAIL.

- [ ] **Step 4: Implementar prop en `Source.tsx`**

Añadir `sourceUrl?: string` a `SourceProps`. Si `sourceUrl` está presente, el `<a href>` usa `sourceUrl`, `rel="noopener noreferrer nofollow"`, label "Ver original"; si no, comportamiento actual (home de la fuente, "Fuente: nombre").

- [ ] **Step 5: Pasar `sourceUrl` desde `ItemList`**

En `ItemList.tsx`, en el `detailFoot` del modal y en el meta de la fila, pasar `sourceUrl={item.sourceUrl}` al `<Source/>`.

- [ ] **Step 6: Run → PASS**

Run: `npm test --workspace @venezuelahelp/frontend-public`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend-public/src
git commit -m "✨ feat(frontend-public): enlace 'Ver original' por ítem (sourceUrl)"
```

### Task A4: `sourceUrl` en la cita del bot

**Files:**

- Modify: el formateador de ítems del bot (`backend/src/telegram/` — `retrieval.ts`/`agent.ts`/`query.ts`, el que arma el texto citado)
- Test: el test correspondiente del bot

- [ ] **Step 1: Localizar el formateo de ítems**

Run: `grep -rn "sourceId\|imageUrl\|titulo" backend/src/telegram | grep -i format`
Identificar dónde se serializa un ítem a texto/cita.

- [ ] **Step 2: Test rojo — la cita incluye `sourceUrl` si existe**

Añadir un ítem con `sourceUrl` al fixture/entrada del test y aserción de que el link aparece en la respuesta.

- [ ] **Step 3: Run → FAIL**, **Step 4: Implementar** (añadir el link al texto del ítem cuando `item.sourceUrl`), **Step 5: Run → PASS**.

- [ ] **Step 6: Commit**

```bash
git add backend/src/telegram
git commit -m "✨ feat(telegram): citar sourceUrl del ítem en la respuesta"
```

---

## FASE B — Motor `rest` + presets + observabilidad

Reemplaza los conectores hardcodeados por un motor declarativo. Las 4 fuentes pasan a config.

### Task B1: Tipos `RestConfig`

**Files:**

- Create: `backend/src/connectors/restConfig.ts`
- Modify: `backend/src/shared/types.ts` (`Source` + `EndpointStat`)

**Interfaces:**

- Produces: `RestConfig`, `RestEndpoint`, `FieldMap`, `EndpointStat`; `Source.connector` gana `"rest"`, `Source` gana `rest?`, `status?`, `lastFetched?`, `endpointStats?`.

- [ ] **Step 1: Crear `restConfig.ts`**

```ts
import type { Category } from "@/shared/types";

export interface FieldMap {
  externalId: string;
  titulo: string;
  texto?: string[];
  lat?: string;
  lng?: string;
  imageUrl?: string;
  sourceUrl?: string;
  sourceUrlTemplate?: string;
  status?: string;
}

export interface RestEndpoint {
  label: string;
  url: string;
  category: Category;
  itemsPath?: string;
  shape?: "array" | "geojson";
  fieldMap: FieldMap;
  headers?: Record<string, string>;
}

export interface RestConfig {
  base: string;
  endpoints: RestEndpoint[];
}
```

- [ ] **Step 2: Extender `Source` y añadir `EndpointStat` en `types.ts`**

```ts
export interface EndpointStat {
  label: string;
  fetched: number;
  error?: string;
}
```

En `Source`: `connector: "jsonApi" | "headless" | "ai" | "rest";` y añadir:

```ts
  rest?: import("@/connectors/restConfig").RestConfig;
  status?: "ok" | "error" | "blocked";
  lastFetched?: number;
  endpointStats?: EndpointStat[];
```

- [ ] **Step 3: Build → PASS**

Run: `npm run build --workspace @venezuelahelp/backend`

- [ ] **Step 4: Commit**

```bash
git add backend/src/connectors/restConfig.ts backend/src/shared/types.ts
git commit -m "✨ feat(connectors): tipos RestConfig + campos de status en Source"
```

### Task B2: Helpers `getPath` y `fillTemplate`

**Files:**

- Create: `backend/src/connectors/restEngine.ts`
- Test: `backend/src/connectors/__tests__/restEngine.test.ts`

**Interfaces:**

- Produces: `getPath(obj: unknown, path: string): unknown`, `fillTemplate(tpl: string, obj: unknown): string`.

- [ ] **Step 1: Tests rojos**

```ts
import { describe, it, expect } from "vitest";
import { getPath, fillTemplate } from "@/connectors/restEngine";

describe("getPath", () => {
  it("resuelve dot-paths anidados e índices", () => {
    expect(getPath({ a: { b: [{ c: 1 }] } }, "a.b.0.c")).toBe(1);
  });
  it("devuelve undefined si falta", () => {
    expect(getPath({ a: {} }, "a.b.c")).toBeUndefined();
  });
});

describe("fillTemplate", () => {
  it("sustituye {campo}", () => {
    expect(fillTemplate("/r/{id}", { id: 42 })).toBe("/r/42");
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npm test --workspace @venezuelahelp/backend -- restEngine`

- [ ] **Step 3: Implementar helpers**

```ts
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function fillTemplate(tpl: string, obj: unknown): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, k) => {
    const v = getPath(obj, k);
    return v == null ? "" : String(v);
  });
}
```

- [ ] **Step 4: Run → PASS**, **Step 5: Commit**

```bash
git add backend/src/connectors/restEngine.ts backend/src/connectors/__tests__/restEngine.test.ts
git commit -m "✨ feat(connectors): getPath + fillTemplate para el motor rest"
```

### Task B3: `mapRow`

**Files:**

- Modify: `backend/src/connectors/restEngine.ts`
- Test: `backend/src/connectors/__tests__/restEngine.test.ts`

**Interfaces:**

- Consumes: `getPath`, `fillTemplate`, `geo`, `imageUrl`, `truncate` (de `@/connectors/types`).
- Produces: `mapRow(row: unknown, ep: RestEndpoint, base: string): NormalizedItem | null`.

- [ ] **Step 1: Tests rojos**

Cubrir: (a) array shape mapea titulo/texto unido/lat/lng/imageUrl relativa→absoluta/sourceUrl de campo; (b) `sourceUrlTemplate` cuando no hay campo; (c) geojson (properties + coordinates [lng,lat]); (d) `externalId` faltante → `null`; (e) titulo vacío → fallback `"(sin título)"`.

```ts
import { mapRow } from "@/connectors/restEngine";
const ep = {
  label: "r",
  url: "x",
  category: "reportes",
  shape: "array",
  fieldMap: {
    externalId: "id",
    titulo: "place",
    texto: ["a", "b"],
    lat: "lat",
    lng: "lng",
    imageUrl: "img",
    sourceUrl: "src",
  },
} as const;
it("mapea una fila array", () => {
  const it_ = mapRow(
    {
      id: 1,
      place: "Catia",
      a: "x",
      b: "y",
      lat: 10,
      lng: -66,
      img: "/p.jpg",
      src: "https://t/1",
    },
    ep,
    "https://s.com",
  );
  expect(it_).toMatchObject({
    category: "reportes",
    externalId: "1",
    titulo: "Catia",
    texto: "x · y",
    sourceUrl: "https://t/1",
    imageUrl: "https://s.com/p.jpg",
  });
  expect(it_!.ubicacion).toEqual({ lat: 10, lng: -66, nombre: "Catia" });
});
it("descarta fila sin externalId", () => {
  expect(mapRow({ place: "x" }, ep, "https://s.com")).toBeNull();
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar `mapRow`**

```ts
import { geo, imageUrl, truncate } from "@/connectors/types";
import type { NormalizedItem } from "@/shared/types";
import type { RestEndpoint } from "@/connectors/restConfig";

export function mapRow(
  row: unknown,
  ep: RestEndpoint,
  base: string,
): NormalizedItem | null {
  const fm = ep.fieldMap;
  const src = ep.shape === "geojson" ? ((row as any)?.properties ?? {}) : row;
  const coords =
    ep.shape === "geojson"
      ? ((row as any)?.geometry?.coordinates as [number, number] | undefined)
      : undefined;

  const externalId = getPath(src, fm.externalId);
  if (externalId == null || String(externalId).trim() === "") return null;

  const titulo = truncate(
    String(getPath(src, fm.titulo) ?? "") || "(sin título)",
    120,
  );
  const texto = truncate(
    (fm.texto ?? [])
      .map((p) => getPath(src, p))
      .filter((v) => v != null && String(v).trim() !== "")
      .join(" · "),
  );
  const lat = coords
    ? coords[1]
    : (getPath(src, fm.lat ?? "") as number | undefined);
  const lng = coords
    ? coords[0]
    : (getPath(src, fm.lng ?? "") as number | undefined);
  const nombre = (getPath(src, fm.titulo) as string | undefined) ?? undefined;

  const sourceUrlRaw =
    (fm.sourceUrl
      ? (getPath(src, fm.sourceUrl) as string | undefined)
      : undefined) ??
    (fm.sourceUrlTemplate
      ? fillTemplate(fm.sourceUrlTemplate, src)
      : undefined);

  return {
    category: ep.category,
    sourceId: "", // lo fija runRestSource
    externalId: String(externalId),
    titulo,
    texto,
    ubicacion: geo(
      typeof lat === "number" ? lat : undefined,
      typeof lng === "number" ? lng : undefined,
      nombre,
    ),
    status: fm.status
      ? (getPath(src, fm.status) as string | undefined)
      : undefined,
    imageUrl: fm.imageUrl
      ? imageUrl(base, getPath(src, fm.imageUrl) as string)
      : undefined,
    sourceUrl: imageUrl(base, sourceUrlRaw),
    raw: row,
  };
}
```

- [ ] **Step 4: Run → PASS**, **Step 5: Commit**

```bash
git commit -am "✨ feat(connectors): mapRow del motor rest (array + geojson)"
```

### Task B4: `runRestSource`

**Files:**

- Modify: `backend/src/connectors/restEngine.ts`
- Test: `backend/src/connectors/__tests__/restEngine.test.ts`

**Interfaces:**

- Consumes: `fetchJson` (inyectable), `RestConfig`.
- Produces: `runRestSource(sourceId, cfg, deps): Promise<{ items: NormalizedItem[]; endpointStats: EndpointStat[] }>` con `deps.fetchJson(url, timeoutMs, headers)`.

- [ ] **Step 1: Tests rojos**

(a) dos endpoints OK → items concatenados con `sourceId` fijado y `endpointStats` con `fetched` correcto; (b) un endpoint lanza → su `endpointStats[i].error` set, `fetched:0`, el otro sigue; (c) `itemsPath` extrae el array anidado; (d) endpoint que devuelve no-array → `fetched:0` + error.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar**

```ts
import { logger } from "@/shared/logger";
import type { EndpointStat } from "@/shared/types";
import type { RestConfig } from "@/connectors/restConfig";

interface RestDeps {
  fetchJson: <T>(
    url: string,
    timeoutMs?: number,
    headers?: Record<string, string>,
  ) => Promise<T>;
}

export async function runRestSource(
  sourceId: string,
  cfg: RestConfig,
  deps: RestDeps,
): Promise<{ items: NormalizedItem[]; endpointStats: EndpointStat[] }> {
  const items: NormalizedItem[] = [];
  const endpointStats: EndpointStat[] = [];
  for (const ep of cfg.endpoints) {
    try {
      const json = await deps.fetchJson<unknown>(ep.url, 15000, ep.headers);
      const arr = getPath(json, ep.itemsPath ?? "");
      if (!Array.isArray(arr)) {
        endpointStats.push({
          label: ep.label,
          fetched: 0,
          error: "respuesta no es un array (¿HTML/SPA?)",
        });
        continue;
      }
      let n = 0;
      for (const row of arr) {
        const mapped = mapRow(row, ep, cfg.base);
        if (!mapped) continue;
        mapped.sourceId = sourceId;
        items.push(mapped);
        n++;
      }
      endpointStats.push({ label: ep.label, fetched: n });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("rest endpoint failed", {
        sourceId,
        label: ep.label,
        error: msg,
      });
      endpointStats.push({ label: ep.label, fetched: 0, error: msg });
    }
  }
  return { items, endpointStats };
}
```

- [ ] **Step 4: Run → PASS**, **Step 5: Commit**

```bash
git commit -am "✨ feat(connectors): runRestSource con stats por endpoint"
```

### Task B5: Presets de las 4 fuentes

**Files:**

- Create: `backend/src/connectors/presets.ts`
- Test: `backend/src/connectors/__tests__/presets.test.ts`

**Interfaces:**

- Produces: `PRESETS: Record<string, RestConfig>` con claves `sismovenezuela`, `ninosvenezuela`, `hospitalesvenezuela`, `terremotovenezuela`.

- [ ] **Step 1: Test rojo — preset de sismovenezuela mapea su fixture**

Reusar `fixtures/sismo_reports_feed.json` etc.: cargar el preset, correr `runRestSource("sismovenezuela", PRESETS.sismovenezuela, { fetchJson: mock })` con `fetchJson` mockeado por URL → fixture, y assert ítems esperados (incluido `sourceUrl`).

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar `presets.ts`**

Traducir cada conector actual a `RestConfig` (mapeos exactos de los `.ts` actuales + `sourceUrl`). sismovenezuela: 4 endpoints (`reportes` array con `source_url`/`media_urls.0`, `acopios`, `edificios` geojson, `solicitudes` itemsPath `data`). ninosvenezuela/hospitales: 1 endpoint Supabase con `headers` apikey/authorization. terremotovenezuela: placeholder con la API actual (se corrige en Fase C).

- [ ] **Step 4: Run → PASS**, **Step 5: Commit**

```bash
git add backend/src/connectors/presets.ts backend/src/connectors/__tests__/presets.test.ts
git commit -m "✨ feat(connectors): presets RestConfig de las 4 fuentes"
```

### Task B6: Seed y orquestador usan `rest`

**Files:**

- Modify: `backend/src/scraper/seed.ts` (cada SEED → `connector:"rest"` + `rest: PRESETS[id]`; `ensureSeedSources` repara la config base sin pisar `enabled`)
- Modify: `backend/src/scraper/orchestrator.ts` (rama `connector === "rest"`)
- Test: `backend/src/scraper/__tests__/orchestrator.test.ts`, `seed.test.ts`

- [ ] **Step 1: Test rojo orquestador — fuente `rest` corre el motor y persiste status/lastFetched/endpointStats**

Mock `runRestSource`; assert que tras `runScrape` la fuente persistida tiene `status:"ok"`, `lastFetched`, `endpointStats`; y que `status:"blocked"` no se degrada a `error`.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar la rama en `runScrape`**

```ts
} else if (source.connector === "rest") {
  if (!source.rest) throw new Error(`source ${source.id} sin rest config`);
  const r = await runRest(source.id, source.rest, { fetchJson });
  items = r.items;
  next.endpointStats = r.endpointStats;
  next.lastFetched = items.length;
  const allFailed = r.endpointStats.length > 0 && r.endpointStats.every((s) => s.error);
  if (source.status === "blocked") next.status = "blocked";
  else next.status = allFailed ? "error" : "ok";
}
```

Inyectar `runRest` (default `runRestSource`) y `fetchJson` en `Deps`. Mantener `next.lastStatus` en sync con `next.status` para no romper consumidores existentes.

- [ ] **Step 4: Seed → `connector:"rest"` + `rest: PRESETS[id]`** y cambiar `ensureSeedSources` para que, si existe, repare `connector`/`rest`/`nombre`/`url` desde el SEED conservando `enabled`/`trustLevel`/timestamps.

- [ ] **Step 5: Run suite scraper → PASS**

Run: `npm test --workspace @venezuelahelp/backend -- scraper`

- [ ] **Step 6: Borrar conectores hardcodeados redundantes**

Eliminar `sismovenezuela.ts`, `terremotovenezuela.ts`, `ninosvenezuela.ts`, `hospitalesvenezuela.ts` y sus tests **solo si** los presets cubren el 100% (verificado por presets.test). Vaciar `registry.ts` o dejarlo para `jsonApi`/`headless` legacy (hoy ninguna). Ajustar `registry.test.ts`.

- [ ] **Step 7: Run toda la suite backend → PASS**

Run: `npm test --workspace @venezuelahelp/backend`

- [ ] **Step 8: Commit**

```bash
git add backend/src
git commit -m "♻️ refactor(scraper): fuentes vía motor rest + presets; status/stats por endpoint"
```

---

## FASE C — Arreglar `terremotovenezuela` + sembrar bloqueadas

### Task C1: Re-descubrir la API de terremotovenezuela

**Files:**

- Modify: `backend/src/connectors/presets.ts` (preset `terremotovenezuela`)
- Test: `backend/src/connectors/__tests__/presets.test.ts`

- [ ] **Step 1: Descubrir el endpoint real (lesson `nextjs-find-real-api-via-chunks`)**

Bajar `https://terremotovenezuela.app/` y los chunks `/_next/static/chunks/*`; grepear `fetch(`/`/api/`/`NEXT_PUBLIC`/base-URLs (el HTML referencia `dreamit.software`). Documentar el host/ruta nuevos de reportes y desaparecidos.

- [ ] **Step 2: Actualizar el preset con los endpoints reales** (categorías, itemsPath, fieldMap, `sourceUrl` al detalle del ítem).

- [ ] **Step 3: Test con fixture nuevo** (capturar una muestra real → `fixtures/tv_*_v2.json`) y assert del mapeo.

- [ ] **Step 4: Smoke en vivo** (con red): `runRestSource("terremotovenezuela", PRESETS.terremotovenezuela, { fetchJson })` real → confirmar `fetched>0`.

- [ ] **Step 5: Commit**

```bash
git commit -am "🐛 fix(connectors): re-descubrir API de terremotovenezuela (preset rest)"
```

### Task C2: Sembrar fuentes bloqueadas con `status:"blocked"`

**Files:**

- Modify: `backend/src/scraper/seed.ts`
- Test: `seed.test.ts`

- [ ] **Step 1: Test rojo** — el seed incluye `desaparecidosterremotovenezuela` con `enabled:false`, `status:"blocked"`, sin `rest` (o con nota), y el orquestador la salta sin marcarla `error`.

- [ ] **Step 2: Run → FAIL**, **Step 3: Añadir la fuente al SEED** con metadata de bloqueo (motivo reCAPTCHA), **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**

```bash
git commit -am "✨ feat(scraper): sembrar fuentes bloqueadas (reCAPTCHA) como blocked"
```

---

## FASE D — Admin: alta/edición `rest` + "Probar" + status

### Task D1: `POST /sources/probe` (dry-run)

**Files:**

- Modify: `backend/src/admin-api/router.ts`
- Test: `backend/src/admin-api/__tests__/router.test.ts`

**Interfaces:**

- Consumes: `runRestSource`, `assertPublicHttpUrl`.
- Produces: ruta `POST /sources/probe` → `{ endpointStats, sample }`.

- [ ] **Step 1: Test rojo** — probe con `rest` válido devuelve `sample` (≤5/endpoint) + `endpointStats`; host privado → 400 (SSRF).

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar** — Zod schema de `RestConfig` (cada `endpoint.url` pasa `assertPublicHttpUrl`); corre `runRestSource("__probe__", rest, {fetchJson})`; recorta a 5 por endpoint; 200.

- [ ] **Step 4: Run → PASS**, **Step 5: Commit**

```bash
git commit -am "✨ feat(admin-api): POST /sources/probe (dry-run de RestConfig)"
```

### Task D2: `POST /sources` tipo `rest` + `PATCH` config

**Files:**

- Modify: `backend/src/admin-api/router.ts`
- Test: `router.test.ts`

- [ ] **Step 1: Test rojo** — `POST /sources` con `{ tipo:"rest", nombre, rest }` crea `connector:"rest"`; `PATCH /sources/{id}` con `{ rest }` actualiza la config; SSRF rechaza.

- [ ] **Step 2: Run → FAIL**, **Step 3: Implementar** (extender `newSourceSchema` con `tipo` y `rest` opcional; rama rest en POST; `patchSourceSchema` acepta `rest`), **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**

```bash
git commit -am "✨ feat(admin-api): alta/edición de fuentes rest"
```

### Task D3: `/stats` expone status/lastFetched/endpointStats

**Files:**

- Modify: `backend/src/admin-api/router.ts` (handler `GET /stats`)
- Test: `router.test.ts`

- [ ] **Step 1: Test rojo** — `/stats` incluye `status`, `lastFetched`, `endpointStats` por fuente.

- [ ] **Step 2: Run → FAIL**, **Step 3: Añadir los campos al map de `sources`**, **Step 4: Run → PASS**, **Step 5: Commit**

```bash
git commit -am "✨ feat(admin-api): /stats con status/lastFetched/endpointStats"
```

### Task D4: Admin SPA — selector tipo + "Probar" + status

**Files:**

- Modify: `frontend-admin/src/types.ts` (Source gana campos), `frontend-admin/src/api.ts` (`probeSource`, `updateSourceConfig`), `frontend-admin/src/components/Sources.tsx`, `frontend-admin/src/components/Dashboard.tsx`
- Test: `frontend-admin/src/components/__tests__/sources.test.tsx`, `dashboard.test.tsx`

- [ ] **Step 1: Test rojo** — el form con tipo "API JSON" muestra campos de endpoint; "Probar" llama `api.probeSource` y muestra la muestra; la lista/Dashboard pinta `status` (ok/amarillo 0-ítems/error/bloqueada) y `lastFetched`.

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar** — `api.ts`: `probeSource(rest)` (POST /sources/probe), `updateSourceConfig(id, rest)` (PATCH). `Sources.tsx`: selector IA/API-JSON, editor mínimo de endpoints (base + filas), botón "Probar" con preview, "Guardar". `Dashboard.tsx`: badge de status por color + `lastFetched`.

- [ ] **Step 4: Run → PASS**

Run: `npm test --workspace @venezuelahelp/frontend-admin`

- [ ] **Step 5: Commit**

```bash
git add frontend-admin/src
git commit -m "✨ feat(frontend-admin): alta/edición rest, botón Probar y status de fuentes"
```

---

## Verificación final

- [ ] `npm test` (toda la suite) → verde.
- [ ] `npm run build` (backend + infra) → verde.
- [ ] Smoke en prod: tras desplegar `VenezuelaHelpScraperStack`, forzar scrape (`aws lambda invoke --function-name <ScraperFn> --invocation-type Event /dev/null`), esperar ~2 min, descargar `snapshot.json` y verificar `sourceUrl` poblado y `terremotovenezuela` con ítems (lesson `validate-data-features-with-prod-smoke`).
- [ ] Buildear ambos frontends antes de cualquier deploy/synth.

## Self-Review (cubierto)

- **Spec coverage:** A (sourceUrl §2.1, §6), B (motor §3, presets §4, orquestador §5, observabilidad §8), C (terremoto §4/§9, blocked §9), D (admin §7), pruebas §12. ✓
- **Type consistency:** `runRestSource` firma idéntica en B4/B6/D1; `EndpointStat`/`status`/`lastFetched` consistentes; `mapRow` fija `sourceId` en B4. ✓

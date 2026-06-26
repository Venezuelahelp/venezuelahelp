# VenezuelaHelp — Fase 6: Conector con IA (self-service) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permitir agregar fuentes de contenido/noticias desde el admin pegando una URL; un conector genérico baja el HTML, lo convierte a texto y usa Bedrock para extraer ítems en las 5 categorías, con control de costo (cada 6 h + solo si cambió).

**Architecture:** Nuevo `connector: "ai"`. `aiConnector.ts` (htmlToText + extractItems + runAiSource) reutiliza `askBedrock`. El orquestador, para fuentes `ai`, corre `runAiSource` y persiste `lastContentHash`/`lastExtractAt`. El admin gana `POST /sources` y `DELETE /sources/{id}` + formulario. El ScraperStack gana el grant de Bedrock.

**Tech Stack:** Node 20, Zod, `@/telegram/bedrock` (askBedrock), `node:crypto`; React (admin SPA); CDK (grant Bedrock).

## Global Constraints

- TypeScript strict; alias `@/`; sin `console.log` (Powertools `@/shared/logger`).
- Reutiliza Fase 1 (`@/shared/repos/*`, `@/shared/types`) y `@/connectors/types` (`geo`, `truncate`). No cambia su comportamiento salvo lo indicado.
- Defaults: `MAX_CHARS=12000` (texto a Bedrock), `MAX_ITEMS=50`, `STALE_MS=6h`, `maxTokens≈1500`.
- Categorías válidas: `reportes | desaparecidos | acopios | edificios | solicitudes`.
- Dedup por clave estable de Fase 1; `externalId` de ítems IA = `sha256(category|titulo|texto)`.
- Auto-publica; validación Zod descarta ítems inválidos. Aislamiento por fuente.
- TDD; Conventional Commits con emoji; rama `feat/fase6-ai-connector`.

## File Structure

```
backend/src/
├── shared/types.ts                 # (modificar) Source: +"ai", extractHint?, lastContentHash?, lastExtractAt?
├── shared/repos/sourceRepo.ts      # (modificar) +delete(id)
├── connectors/aiConnector.ts       # NUEVO: htmlToText, extractItems, runAiSource
├── scraper/orchestrator.ts         # (modificar) rama connector==="ai"
└── admin-api/router.ts             # (modificar) POST /sources, DELETE /sources/{id}
infra/lib/scraper-stack.ts          # (modificar) grant bedrock al scraper fn
frontend-admin/src/
├── api.ts                          # (modificar) createSource, deleteSource
├── types.ts                        # (modificar) Source: +extractHint?
└── components/Sources.tsx          # (modificar) form "Agregar fuente" + borrar
└── App.tsx                         # (modificar) wire onCreate/onDelete
```

---

### Task 1: Tipos + `SourceRepo.delete`

**Files:**

- Modify: `backend/src/shared/types.ts`
- Modify: `backend/src/shared/repos/sourceRepo.ts`
- Test: `backend/src/shared/__tests__/sourceRepo.test.ts`

**Interfaces:**

- Produces: `Source.connector: "jsonApi" | "headless" | "ai"`; `Source.extractHint?: string`; `Source.lastContentHash?: string`; `Source.lastExtractAt?: string`. `SourceRepo.delete(id: string): Promise<void>`.

- [ ] **Step 1: Modificar `types.ts`** — en `interface Source` cambiar el union y añadir campos:

```ts
export interface Source {
  id: string;
  nombre: string;
  url: string;
  connector: "jsonApi" | "headless" | "ai";
  endpoint?: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: "ok" | "error";
  errorMsg?: string;
  extractHint?: string;
  lastContentHash?: string;
  lastExtractAt?: string;
}
```

- [ ] **Step 2: Test que falla** — en `sourceRepo.test.ts` añade:

```ts
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
// ...
it("delete removes the source by SOURCE#id / META", async () => {
  ddbMock.on(DeleteCommand).resolves({});
  await new SourceRepo().delete("sismo");
  const key = ddbMock.commandCalls(DeleteCommand)[0].args[0].input.Key;
  expect(key).toEqual({ PK: "SOURCE#sismo", SK: "META" });
});
```

- [ ] **Step 3: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- sourceRepo` → FAIL (delete no existe).

- [ ] **Step 4: Implementar** — en `sourceRepo.ts` importa `DeleteCommand` y añade el método:

```ts
async delete(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: SOURCE_PK(id), SK } }),
  );
}
```

- [ ] **Step 5: Correr y ver pasar** — PASS. Build: `npm run build --workspace @venezuelahelp/backend`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/types.ts backend/src/shared/repos/sourceRepo.ts backend/src/shared/__tests__/sourceRepo.test.ts
git commit -m "✨ feat(backend): add ai connector type, source AI fields, SourceRepo.delete"
```

---

### Task 2: Conector IA (`aiConnector.ts`)

**Files:**

- Create: `backend/src/connectors/aiConnector.ts`
- Test: `backend/src/connectors/__tests__/aiConnector.test.ts`

**Interfaces:**

- Consumes: `geo`, `truncate` (`@/connectors/types`); `NormalizedItem`, `Source` (`@/shared/types`); `@/shared/logger`.
- Produces:
  - `htmlToText(html: string, maxChars?: number): string`
  - `extractItems(text: string, hint: string | undefined, modelId: string, sourceId: string, deps: { askBedrock: (modelId: string, system: string, user: string) => Promise<{ text: string }> }): Promise<NormalizedItem[]>`
  - `runAiSource(source: Source, now: string, modelId: string, deps: { fetchText: (url: string) => Promise<string>; askBedrock: (modelId: string, system: string, user: string) => Promise<{ text: string }> }): Promise<{ items: NormalizedItem[]; nextHash: string; nextExtractAt?: string; skipped: boolean }>`

- [ ] **Step 1: Test que falla**

Create `backend/src/connectors/__tests__/aiConnector.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  htmlToText,
  extractItems,
  runAiSource,
} from "@/connectors/aiConnector";
import type { Source } from "@/shared/types";

describe("htmlToText", () => {
  it("strips scripts, styles and tags and collapses whitespace", () => {
    const html =
      "<style>x{}</style><script>bad()</script><h1>Hola</h1>  <p>mundo</p>";
    expect(htmlToText(html)).toBe("Hola mundo");
  });
  it("truncates to maxChars", () => {
    expect(htmlToText("<p>" + "a".repeat(100) + "</p>", 10).length).toBe(10);
  });
});

const askOk = (json: string) => vi.fn(async () => ({ text: json }));

describe("extractItems", () => {
  it("parses a JSON array, validates with Zod and maps to NormalizedItem", async () => {
    const json = `Aquí está: [
      {"category":"acopios","titulo":"Centro Chacao","texto":"agua","ubicacion":{"nombre":"Chacao"}},
      {"category":"INVALID","titulo":"x","texto":"y"},
      {"category":"reportes","texto":"sin titulo"}
    ]`;
    const items = await extractItems("texto", "acopios", "m", "noticias", {
      askBedrock: askOk(json),
    });
    expect(items).toHaveLength(1); // los 2 inválidos (cat mala / sin titulo) se descartan
    expect(items[0]).toMatchObject({
      category: "acopios",
      sourceId: "noticias",
      titulo: "Centro Chacao",
    });
    expect(items[0].externalId.length).toBeGreaterThan(0);
  });
  it("returns [] when no JSON array is present", async () => {
    expect(
      await extractItems("t", undefined, "m", "s", {
        askBedrock: askOk("no hay nada"),
      }),
    ).toEqual([]);
  });
});

describe("runAiSource", () => {
  const src: Source = {
    id: "noticias",
    nombre: "N",
    url: "https://x/y",
    connector: "ai",
    enabled: true,
  };
  const html = "<p>contenido de noticias</p>";
  const itemsJson = '[{"category":"reportes","titulo":"t","texto":"x"}]';

  it("skips Bedrock when content unchanged and < 6h", async () => {
    const text = htmlToText(html);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(text).digest("hex");
    const askBedrock = vi.fn();
    const r = await runAiSource(
      { ...src, lastContentHash: hash, lastExtractAt: "2026-06-26T00:00:00Z" },
      "2026-06-26T01:00:00Z",
      "m",
      { fetchText: vi.fn(async () => html), askBedrock: askBedrock as any },
    );
    expect(r.skipped).toBe(true);
    expect(askBedrock).not.toHaveBeenCalled();
  });

  it("calls Bedrock when content changed", async () => {
    const r = await runAiSource(src, "2026-06-26T01:00:00Z", "m", {
      fetchText: vi.fn(async () => html),
      askBedrock: askOk(itemsJson),
    });
    expect(r.skipped).toBe(false);
    expect(r.items).toHaveLength(1);
    expect(r.nextHash.length).toBeGreaterThan(0);
    expect(r.nextExtractAt).toBe("2026-06-26T01:00:00Z");
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- aiConnector` → FAIL.

- [ ] **Step 3: Implementar `aiConnector.ts`**

```ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { geo, truncate } from "@/connectors/types";
import { logger } from "@/shared/logger";
import type { NormalizedItem, Source } from "@/shared/types";

const MAX_CHARS = 12000;
const MAX_ITEMS = 50;
const STALE_MS = 6 * 60 * 60 * 1000;

export function htmlToText(html: string, maxChars = MAX_CHARS): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > maxChars ? t.slice(0, maxChars) : t;
}

const aiItem = z.object({
  category: z.enum([
    "reportes",
    "desaparecidos",
    "acopios",
    "edificios",
    "solicitudes",
  ]),
  titulo: z.string().min(1),
  texto: z.string().optional().default(""),
  ubicacion: z
    .object({
      nombre: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
});

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

interface BedrockDep {
  askBedrock: (
    modelId: string,
    system: string,
    user: string,
  ) => Promise<{ text: string }>;
}

export async function extractItems(
  text: string,
  hint: string | undefined,
  modelId: string,
  sourceId: string,
  deps: BedrockDep,
): Promise<NormalizedItem[]> {
  const system =
    "Eres un extractor de información sobre el terremoto de Venezuela. Devuelves SOLO un array JSON válido, sin texto adicional.";
  const user = [
    "Del siguiente contenido, extrae los ítems relevantes al terremoto como un array JSON.",
    'Cada ítem: {"category": una de [reportes, desaparecidos, acopios, edificios, solicitudes], "titulo": string, "texto": string, "ubicacion"?: {"nombre"?: string, "lat"?: number, "lng"?: number}}.',
    hint ? `Enfócate en: ${hint}.` : "",
    "Si no hay nada relevante, devuelve [].",
    "",
    "CONTENIDO:",
    text,
  ].join("\n");

  const { text: out } = await deps.askBedrock(modelId, system, user);
  const start = out.indexOf("[");
  const end = out.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(out.slice(start, end + 1));
  } catch {
    logger.warn("aiConnector: JSON inválido de Bedrock", { sourceId });
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const items: NormalizedItem[] = [];
  let dropped = 0;
  for (const candidate of raw.slice(0, MAX_ITEMS)) {
    const parsed = aiItem.safeParse(candidate);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const it = parsed.data;
    items.push({
      category: it.category,
      sourceId,
      externalId: sha256(`${it.category}|${it.titulo}|${it.texto}`),
      titulo: truncate(it.titulo, 120),
      texto: truncate(
        [it.texto, it.ubicacion?.nombre].filter(Boolean).join(" · "),
      ),
      ubicacion: geo(
        it.ubicacion?.lat,
        it.ubicacion?.lng,
        it.ubicacion?.nombre,
      ),
      raw: it,
    });
  }
  if (dropped)
    logger.warn("aiConnector: ítems descartados por validación", {
      sourceId,
      dropped,
    });
  return items;
}

export async function runAiSource(
  source: Source,
  now: string,
  modelId: string,
  deps: BedrockDep & { fetchText: (url: string) => Promise<string> },
): Promise<{
  items: NormalizedItem[];
  nextHash: string;
  nextExtractAt?: string;
  skipped: boolean;
}> {
  const html = await deps.fetchText(source.url);
  const text = htmlToText(html);
  const hash = sha256(text);
  const lastMs = source.lastExtractAt ? Date.parse(source.lastExtractAt) : 0;
  const fresh = Date.parse(now) - lastMs < STALE_MS;
  if (hash === source.lastContentHash && fresh) {
    return { items: [], nextHash: hash, skipped: true };
  }
  const items = await extractItems(
    text,
    source.extractHint,
    modelId,
    source.id,
    deps,
  );
  return { items, nextHash: hash, nextExtractAt: now, skipped: false };
}
```

- [ ] **Step 4: Correr y ver pasar** — PASS + suite backend + build.

- [ ] **Step 5: Commit**

```bash
git add backend/src/connectors/aiConnector.ts backend/src/connectors/__tests__/aiConnector.test.ts
git commit -m "✨ feat(backend): add AI connector (htmlToText, extractItems, runAiSource)"
```

---

### Task 3: Orquestador soporta `connector:"ai"`

**Files:**

- Modify: `backend/src/scraper/orchestrator.ts`
- Test: `backend/src/scraper/__tests__/orchestrator.test.ts`

**Interfaces:**

- Consumes: `runAiSource` (`@/connectors/aiConnector`), `ConfigRepo` (`@/shared/repos/configRepo`), `askBedrock` (`@/telegram/bedrock`).
- Produces: `runScrape` ahora acepta deps adicionales `configRepo`, `runAiSource`, `fetchText`, `askBedrock` (todas con defaults reales). Para fuentes `connector:"ai"` persiste `lastContentHash`/`lastExtractAt`.

- [ ] **Step 1: Test que falla** — añade a `orchestrator.test.ts`:

```ts
it("runs the AI connector for connector:'ai' sources and persists hash/extractAt", async () => {
  const aiSrc = {
    id: "noticias",
    nombre: "N",
    url: "u",
    connector: "ai" as const,
    enabled: true,
  };
  const itemRepo = { upsert: vi.fn(async () => "created" as const) };
  const sourceRepo = {
    listEnabled: vi.fn(async () => [aiSrc]),
    put: vi.fn(async () => {}),
  };
  const runAiSource = vi.fn(async () => ({
    items: [
      {
        category: "reportes",
        sourceId: "noticias",
        externalId: "1",
        titulo: "t",
        texto: "x",
        raw: {},
      },
    ],
    nextHash: "h1",
    nextExtractAt: "2026-06-26T00:00:00Z",
    skipped: false,
  }));
  const deps = {
    sourceRepo,
    itemRepo,
    seed: vi.fn(async () => {}),
    getConnector: () => undefined,
    configRepo: {
      get: vi.fn(async () => ({
        scrapeRateMin: 30,
        bedrockModelId: "m",
        systemPrompt: "s",
        botTriggerMode: "mention" as const,
      })),
    },
    runAiSource,
    fetchText: vi.fn(),
    askBedrock: vi.fn(),
  };
  const res = await runScrape("2026-06-26T00:00:00Z", deps as any);
  expect(runAiSource).toHaveBeenCalled();
  expect(itemRepo.upsert).toHaveBeenCalledTimes(1);
  const persisted = sourceRepo.put.mock.calls[0][0];
  expect(persisted).toMatchObject({
    id: "noticias",
    lastContentHash: "h1",
    lastExtractAt: "2026-06-26T00:00:00Z",
    lastStatus: "ok",
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- orchestrator` → FAIL.

- [ ] **Step 3: Implementar** — en `orchestrator.ts`:
  - Imports: `import { runAiSource as defaultRunAiSource } from "@/connectors/aiConnector";`, `import { ConfigRepo } from "@/shared/repos/configRepo";`, `import { askBedrock as defaultAskBedrock } from "@/telegram/bedrock";`.
  - Añade a la interfaz `Deps`: `configRepo?: Pick<ConfigRepo, "get">; runAiSource?: typeof defaultRunAiSource; fetchText?: (url: string) => Promise<string>; askBedrock?: typeof defaultAskBedrock;`
  - Resuelve defaults: `const configRepo = deps?.configRepo ?? new ConfigRepo();` `const runAi = deps?.runAiSource ?? defaultRunAiSource;` `const fetchText = deps?.fetchText ?? (async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(\`GET ${url} ${r.status}\`); return r.text(); });` `const askBedrock = deps?.askBedrock ?? defaultAskBedrock;`
  - Lee config una vez (para el modelo): `const config = await configRepo.get();` (después del seed).
  - En el bucle, dentro del `try`, reemplaza el bloque que obtiene items por:

```ts
let items;
if (source.connector === "ai") {
  const r = await runAi(source, now, config.bedrockModelId, {
    fetchText,
    askBedrock,
  });
  next.lastContentHash = r.nextHash;
  if (r.nextExtractAt) next.lastExtractAt = r.nextExtractAt;
  items = r.items;
} else {
  const connector = getConnector(source.id);
  if (!connector) throw new Error(`no connector for ${source.id}`);
  items = await connector.fetchItems();
}
result.fetched = items.length;
for (let i = 0; i < items.length; i += UPSERT_CONCURRENCY) {
  const batch = items.slice(i, i + UPSERT_CONCURRENCY);
  const outcomes = await Promise.all(
    batch.map((item) => itemRepo.upsert(item, now)),
  );
  for (const r of outcomes) result[r] += 1;
}
```

(Mantén el resto: `next.lastStatus = "ok"`, catch que marca error, `sourceRepo.put(next)`.)

- [ ] **Step 4: Correr y ver pasar** — PASS + suite backend + build.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scraper/orchestrator.ts backend/src/scraper/__tests__/orchestrator.test.ts
git commit -m "✨ feat(scraper): run AI connector for ai sources and persist content hash"
```

---

### Task 4: Admin API — `POST /sources` y `DELETE /sources/{id}`

**Files:**

- Modify: `backend/src/admin-api/router.ts`
- Test: `backend/src/admin-api/__tests__/router.test.ts`

**Interfaces:**

- Consumes: `SourceRepo` (`get`, `put`, `delete`).
- Produces: en `route`: `POST /sources` (crea fuente AI) y `DELETE /sources/{id}`. `RouteDeps.sourceRepo` ahora incluye `delete`.

- [ ] **Step 1: Test que falla** — añade a `router.test.ts`:

```ts
it("POST /sources creates an AI source with a slug id", async () => {
  const sourceRepo = {
    list: vi.fn(),
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(),
  };
  const res = await route(
    "POST",
    "/sources",
    {
      nombre: "Noticias VE",
      url: "https://news.example/ve",
      extractHint: "acopios",
    },
    { sourceRepo } as any,
  );
  expect(res.status).toBe(201);
  const put = sourceRepo.put.mock.calls[0][0];
  expect(put).toMatchObject({
    id: "noticias-ve",
    nombre: "Noticias VE",
    url: "https://news.example/ve",
    connector: "ai",
    enabled: true,
    extractHint: "acopios",
  });
});
it("POST /sources rejects an invalid url with 400", async () => {
  const sourceRepo = {
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
  const res = await route(
    "POST",
    "/sources",
    { nombre: "x", url: "no-es-url" },
    { sourceRepo } as any,
  );
  expect(res.status).toBe(400);
});
it("DELETE /sources/{id} deletes", async () => {
  const sourceRepo = {
    delete: vi.fn(async () => {}),
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn(),
  };
  const res = await route("DELETE", "/sources/noticias-ve", undefined, {
    sourceRepo,
  } as any);
  expect(res.status).toBe(200);
  expect(sourceRepo.delete).toHaveBeenCalledWith("noticias-ve");
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- admin-api/__tests__/router` → FAIL.

- [ ] **Step 3: Implementar** — en `router.ts`:
  - Añade a `RouteDeps.sourceRepo` el método `delete`: `sourceRepo: Pick<SourceRepo, "list" | "get" | "put" | "delete">;`
  - Helper slug:

```ts
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "fuente"
  );
}
```

- Schema POST:

```ts
const newSourceSchema = z.object({
  nombre: z.string().min(1).max(80),
  url: z.string().url(),
  extractHint: z.string().max(500).optional(),
});
```

- Rutas (antes del 404 final):

```ts
if (method === "POST" && path === "/sources") {
  const parsed = newSourceSchema.safeParse(body);
  if (!parsed.success)
    return {
      status: 400,
      body: { error: "invalid", issues: parsed.error.issues },
    };
  let id = slugify(parsed.data.nombre);
  for (let n = 2; await deps.sourceRepo.get(id); n++)
    id = `${slugify(parsed.data.nombre)}-${n}`;
  const source = {
    id,
    nombre: parsed.data.nombre,
    url: parsed.data.url,
    connector: "ai" as const,
    enabled: true,
    extractHint: parsed.data.extractHint,
  };
  await deps.sourceRepo.put(source);
  return { status: 201, body: source };
}
const del = path.match(/^\/sources\/([^/]+)$/);
if (method === "DELETE" && del) {
  await deps.sourceRepo.delete(decodeURIComponent(del[1]));
  return { status: 200, body: { deleted: decodeURIComponent(del[1]) } };
}
```

(Asegúrate de que el match de `PATCH /sources/{id}` existente siga funcionando; el `del` regex es solo para DELETE.)

- [ ] **Step 4: Correr y ver pasar** — PASS + suite backend + build.

- [ ] **Step 5: Commit**

```bash
git add backend/src/admin-api/router.ts backend/src/admin-api/__tests__/router.test.ts
git commit -m "✨ feat(admin-api): add POST /sources (AI) and DELETE /sources/{id}"
```

---

### Task 5: Infra — grant Bedrock al ScraperStack

**Files:**

- Modify: `infra/lib/scraper-stack.ts`
- Test: `infra/lib/__tests__/scraper-stack.test.ts`

**Interfaces:** el scraper Lambda gana permiso `bedrock:InvokeModel` + `bedrock:Converse` (porque corre el aiConnector).

- [ ] **Step 1: Test que falla** — añade a `scraper-stack.test.ts`:

```ts
import { Match } from "aws-cdk-lib/assertions";
it("grants the scraper bedrock invoke permission", () => {
  template().hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Action: Match.arrayWith(["bedrock:InvokeModel"]) }),
      ]),
    },
  });
});
```

(añade `Match` al import existente de `aws-cdk-lib/assertions`.)

- [ ] **Step 2: Correr y ver fallar** — `npm run build --workspace @venezuelahelp/frontend-admin` no aplica aquí; corre `npm test --workspace @venezuelahelp/infra -- scraper` → FAIL.

- [ ] **Step 3: Implementar** — en `scraper-stack.ts` (tras los grants existentes), importa `iam` y añade:

```ts
import * as iam from "aws-cdk-lib/aws-iam";
// ...
fn.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:InvokeModel", "bedrock:Converse"],
    resources: ["*"],
  }),
);
```

- [ ] **Step 4: Correr y ver pasar** — PASS + `npm test` (todo) + build.

- [ ] **Step 5: Commit**

```bash
git add infra/lib/scraper-stack.ts infra/lib/__tests__/scraper-stack.test.ts
git commit -m "🏗️ feat(infra): grant Bedrock invoke to the scraper (AI connector)"
```

---

### Task 6: Admin SPA — agregar/eliminar fuentes

**Files:**

- Modify: `frontend-admin/src/types.ts`, `frontend-admin/src/api.ts`, `frontend-admin/src/components/Sources.tsx` (+css), `frontend-admin/src/App.tsx`
- Test: `frontend-admin/src/__tests__/api.test.ts`, `frontend-admin/src/components/__tests__/sources.test.tsx`, `frontend-admin/src/__tests__/App.test.tsx`

**Interfaces:**

- `api.ts`: `createSource(body: { nombre: string; url: string; extractHint?: string }): Promise<Source>` (POST /sources), `deleteSource(id: string): Promise<void>` (DELETE /sources/{id}).
- `Sources` gana props `onCreate(body)`, `onDelete(id)`, `creating: boolean`.

- [ ] **Step 1: Tests que fallan**
  - `api.test.ts`: `createSource` hace POST a `/sources` con el body y bearer; `deleteSource` hace DELETE a `/sources/{id}`.
  - `sources.test.tsx`: completar el formulario (nombre+url) y enviar llama `onCreate({nombre,url,extractHint})`; el botón eliminar de una fila llama `onDelete(id)`.
  - `App.test.tsx`: en la pestaña Fuentes, crear una fuente llama `api.createSource` y refresca; eliminar llama `api.deleteSource`.

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/frontend-admin -- api sources app` → FAIL.

- [ ] **Step 3: Implementar**
  - `types.ts`: añade `extractHint?: string;` a `Source` (y `connector` puede ser string).
  - `api.ts`: añade los dos métodos siguiendo el patrón existente (fetch + bearer + throw on non-ok; createSource devuelve json, deleteSource ignora body).
  - `Sources.tsx`: un `<form>` controlado (estado local nombre/url/hint) que en submit llama `props.onCreate({nombre,url,extractHint})` y limpia; botón "Agregar" deshabilitado mientras `creating`. Por cada fuente, un botón "Eliminar" (con `window.confirm` o un estado de confirmación) que llama `props.onDelete(source.id)`. Mostrar una etiqueta "IA" si `connector === "ai"`. Seguir `frontend-public/DESIGN.md`.
  - `App.tsx`: pasar a `Sources` `onCreate={(b)=>{ setCreating(true); api.createSource(b).then(refreshSources).catch(()=>setError("No se pudo agregar la fuente.")).finally(()=>mountedRef.current && setCreating(false)); }}` y `onDelete={(id)=> api.deleteSource(id).then(refreshSources).catch(()=>setError("No se pudo eliminar la fuente."))}` y `creating`. (Reusa el patrón de error/mountedRef ya existente.)

- [ ] **Step 4: Correr y ver pasar** — PASS + suite admin + `npm run build --workspace @venezuelahelp/frontend-admin`.

- [ ] **Step 5: Commit**

```bash
git add frontend-admin/src
git commit -m "✨ feat(frontend-admin): add/remove sources from the admin"
```

---

### Task 7: Verificación + deploy + smoke

- [ ] **Step 1:** `npm test` (todo verde) + `npm run build` (todo).
- [ ] **Step 2:** build admin: `npm run build --workspace @venezuelahelp/frontend-admin`.
- [ ] **Step 3: synth** — `cd infra && CDK_DEFAULT_ACCOUNT=720115910277 CDK_DEFAULT_REGION=us-east-1 npx cdk synth --profile VenezuelaHelp` (5 stacks).
- [ ] **Step 4: deploy** (creds exportadas):

```bash
cd infra
eval "$(aws configure export-credentials --profile VenezuelaHelp --format env)"
CDK_DEFAULT_ACCOUNT=720115910277 CDK_DEFAULT_REGION=us-east-1 npx cdk deploy VenezuelaHelpScraperStack VenezuelaHelpAdminStack --require-approval never
```

- [ ] **Step 5: smoke** — en el admin (https://d12j3syxalt8mx.cloudfront.net), loguear, ir a Fuentes, agregar una fuente de noticias real, "Scrape ahora", y verificar que aparecen ítems (en el dashboard sube el conteo / en el bot/público aparecen). Revisar logs del scraper para confirmar la extracción IA.
- [ ] **Step 6: Commit** — `git commit -m "✅ test(fase6): green suite for AI connector" --allow-empty`.

---

## Self-Review

- **Cobertura del spec:** §2 tipos (Task 1) · §3 aiConnector (Task 2) · §4 orquestador (Task 3) · §5 admin API (Task 4) · §7 infra grant (Task 5) · §6 admin SPA (Task 6) · §9 pruebas (cada task) · deploy (Task 7). ✓
- **Placeholders:** sin TBD; código completo. ✓
- **Consistencia de tipos:** `Source` (Task 1) consumido por 2/3/4/6; `runAiSource`/`extractItems` (Task 2) por Task 3; `RouteDeps.sourceRepo.delete` (Task 4) usa `SourceRepo.delete` (Task 1); `createSource`/`deleteSource` (Task 6) ↔ rutas (Task 4). ✓
- **Fuera de alcance:** headless, moderación de ítems, TTL/reconciliación, rate-limit (fast-follow).

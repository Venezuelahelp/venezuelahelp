# Admin Observabilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloques A y B del spec `docs/superpowers/specs/2026-07-02-observabilidad-admin-bot-y-publico-status-design.md` (PR `feat/admin-observabilidad`): visor de Q&A del bot por usuario (endpoint `GET /qa-logs/{chatId}` + drawer en el tab Usuarios), edad del snapshot en `GET /stats` + aviso en el Dashboard, búsqueda de ítems sobre el snapshot (`GET /items/search` + tab «Buscar»), e historial de scrapes (`ScrapeRunRepo` + persistencia best-effort en el orchestrator + `GET /scrape-runs` + sección «Últimos scrapes»).

**Architecture:** El admin-api (Lambda `AdminFn`, router puro `route()` con deps inyectadas) gana 3 rutas GET y query-params. La edad del snapshot sale de un `HeadObject` S3 (`LastModified` = fin del último scrape; `generatedAt` interno se sella al inicio y no sirve). La búsqueda **reutiliza el query engine del data-api** (`data-api/query.ts` + `data-api/snapshot.ts`: fetch HTTP del snapshot público + gunzip + cache 60 s) — no toca DynamoDB. El historial de scrapes vive en la partición compartida `PK=SCRAPERUN` (patrón APIREQ: `Query`, nunca `Scan`) con TTL 30 días; lo escribe `runScrape()` al terminar, en try/catch (un fallo al guardar NO rompe el scrape). El frontend-admin suma el drawer `QaLogDrawer`, el tab `Search` y dos secciones nuevas del `Dashboard`, todo con el patrón existente de `api.ts` (fetch + token Cognito) y listas acotadas (max-height + scroll interno). En infra, `AdminStack` gana las rutas, `SNAPSHOT_BUCKET`/`SNAPSHOT_URL` y `grantRead` sobre `snapshot.json`.

**Tech Stack:** TypeScript strict, Node 20 Lambda, DynamoDB single-table (`@aws-sdk/lib-dynamodb`), S3 (`@aws-sdk/client-s3`), Zod, React 18 + CSS Modules (Vite), AWS CDK v2, vitest + aws-sdk-client-mock + @testing-library/react + `aws-cdk-lib/assertions`.

## Global Constraints

- **TypeScript strict** siempre; imports con alias `@/` → `backend/src` (y `@/` → `frontend-admin/src` en el admin).
- Variables de entorno vía `process.env` (`SNAPSHOT_BUCKET`, `SNAPSHOT_URL`); si faltan, degradar sin lanzar (ver contrato de `getSnapshotUpdatedAt`).
- **Sin `console.log`** — logging estructurado con Powertools (`@/shared/logger`).
- **TDD estricto**: test que falla → implementación mínima → test verde → commit. Backend: `npm test --workspace @venezuelahelp/backend`. Frontend: `npm test --workspace @venezuelahelp/frontend-admin`. Infra: `npm test --workspace @venezuelahelp/infra`. (Correr vitest SIEMPRE desde el workspace, nunca la raíz, por el alias `@/`.)
- Repos DynamoDB se testean con `aws-sdk-client-mock`; infra con `aws-cdk-lib/assertions`.
- **Partición compartida = `Query`, NUNCA `Scan`** (lección APIREQ: un Scan sobre ~55k ítems `CAT#` tira ThrottlingException).
- **Conventional Commits con emoji**: `<emoji> <tipo>(<scope>): <descripción imperativa>`.
- **Un fallo nuevo no puede tumbar flujos existentes**: historial de scrapes best-effort, `HeadObject` con try/catch → `snapshotUpdatedAt` ausente, `getScrapeRuns` del front con `.catch(() => [])` para no romper la carga inicial del admin.
- No tocar la rama del dueño ni hacer push; solo commits locales en la rama de trabajo `feat/admin-observabilidad`.

---

## Task 1 — `ScrapeRun` + `ScrapeRunRepo` (partición compartida, TTL 30 días)

**Files:**

- Modify: `backend/src/shared/types.ts` (añadir tipos tras `QaLogEntry`, ~línea 189)
- Modify: `backend/src/shared/keys.ts` (añadir `SCRAPERUN_PK` junto a `APIREQ_PK`, ~línea 36)
- Create: `backend/src/shared/repos/scrapeRunRepo.ts`
- Create: `backend/src/shared/repos/__tests__/scrapeRunRepo.test.ts`

**Interfaces:**

- Produces: `interface ScrapeRun { ts: string; durationMs: number; sourcesTotal: number; sourcesOk: number; sourcesError: number; created: number; updated: number; unchanged: number; errors: ScrapeRunError[] }`, `interface ScrapeRunError { sourceId: string; error: string }`, `const SCRAPERUN_PK = "SCRAPERUN"`, `class ScrapeRunRepo { put(run: ScrapeRun): Promise<void>; list(limit?: number): Promise<ScrapeRun[]> }`
- Consumes: `ddb`, `TABLE_NAME` de `@/shared/ddb` (mismo patrón que `ApiRequestRepo`/`QaLogRepo`).

### Steps

- [ ] Escribir el test `backend/src/shared/repos/__tests__/scrapeRunRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
import type { ScrapeRun } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const run: ScrapeRun = {
  ts: "2026-07-02T00:28:00.000Z",
  durationMs: 660000,
  sourcesTotal: 11,
  sourcesOk: 10,
  sourcesError: 1,
  created: 12,
  updated: 340,
  unchanged: 45000,
  errors: [{ sourceId: "bad", error: "HTTP 500" }],
};

describe("ScrapeRunRepo", () => {
  it("guarda la corrida bajo la partición compartida SCRAPERUN / SK=ts con TTL 30 días", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new ScrapeRunRepo().put(run);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "SCRAPERUN",
      SK: "2026-07-02T00:28:00.000Z",
      sourcesTotal: 11,
      created: 12,
      errors: [{ sourceId: "bad", error: "HTTP 500" }],
    });
    const expectedTtl =
      Math.floor(Date.parse(run.ts) / 1000) + 30 * 24 * 60 * 60;
    expect(item?.ttl).toBe(expectedTtl);
  });

  it("list usa Query sobre la partición compartida (NO Scan), más reciente primero", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ PK: "SCRAPERUN", SK: run.ts, ttl: 123, ...run }],
    });
    const runs = await new ScrapeRunRepo().list();
    expect(runs).toEqual([run]);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.KeyConditionExpression).toContain("PK = :pk");
    expect(input.ExpressionAttributeValues).toMatchObject({
      ":pk": "SCRAPERUN",
    });
    expect(input.ScanIndexForward).toBe(false);
    expect(input.Limit).toBe(10);
  });

  it("list respeta el limit pedido", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await new ScrapeRunRepo().list(3);
    expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.Limit).toBe(3);
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/shared/repos/__tests__/scrapeRunRepo.test.ts` → falla con `Cannot find module '@/shared/repos/scrapeRunRepo'` (y `ScrapeRun` no existe en `@/shared/types`).
- [ ] Implementación mínima. En `backend/src/shared/types.ts`, después de `QaLogEntry`:

```ts
// Resumen de una corrida del scraper (historial de observabilidad del admin).
// Vive en la partición compartida SCRAPERUN con TTL de 30 días.
export interface ScrapeRunError {
  sourceId: string;
  error: string;
}

export interface ScrapeRun {
  // ISO del INICIO de la corrida (el mismo `now` que recibe runScrape).
  ts: string;
  durationMs: number;
  sourcesTotal: number;
  sourcesOk: number;
  sourcesError: number;
  created: number;
  updated: number;
  unchanged: number;
  // Acotado: máx. 10 fuentes fallidas, mensajes recortados a 300 chars.
  errors: ScrapeRunError[];
}
```

En `backend/src/shared/keys.ts`, junto a `APIREQ_PK`/`APIKEY_PK`:

```ts
// Historial de corridas del scraper: PARTICIÓN COMPARTIDA (PK fija) para
// listar con Query barato — NO Scan. PK="SCRAPERUN", SK=<ts ISO del inicio>.
export const SCRAPERUN_PK = "SCRAPERUN";
```

Crear `backend/src/shared/repos/scrapeRunRepo.ts`:

```ts
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { SCRAPERUN_PK } from "@/shared/keys";
import type { ScrapeRun } from "@/shared/types";

function toRun(item: Record<string, unknown>): ScrapeRun {
  const { PK, SK, ttl, ...rest } = item;
  void PK;
  void SK;
  void ttl;
  return rest as unknown as ScrapeRun;
}

// Historial acotado: TTL de DynamoDB (atributo `ttl`, ya habilitado en la
// tabla — lo usa QaLogRepo) para que la partición no crezca sin límite.
const RETENTION_DAYS = 30;

export class ScrapeRunRepo {
  async put(run: ScrapeRun): Promise<void> {
    const ttl =
      Math.floor(Date.parse(run.ts) / 1000) + RETENTION_DAYS * 24 * 60 * 60;
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: SCRAPERUN_PK, SK: run.ts, ...run, ttl },
      }),
    );
  }

  // Query sobre la partición compartida (como APIREQ) — NUNCA Scan.
  // ScanIndexForward:false → las corridas más recientes primero.
  async list(limit = 10): Promise<ScrapeRun[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": SCRAPERUN_PK },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map(toRun);
  }
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/shared/repos/__tests__/scrapeRunRepo.test.ts` → 3 passed.
- [ ] Commit: `git add backend/src/shared && git commit -m "✨ feat(backend): añade ScrapeRunRepo con partición compartida SCRAPERUN y TTL 30 días"`

---

## Task 2 — El orchestrator persiste el `ScrapeRun` al terminar (best-effort)

**Files:**

- Modify: `backend/src/scraper/orchestrator.ts` (imports ~líneas 1–13, interfaz `Deps` ~línea 24, cierre de `runScrape` ~línea 128)
- Modify: `backend/src/scraper/__tests__/orchestrator.test.ts` (añadir un `describe` al final)

**Interfaces:**

- Consumes: `ScrapeRunRepo.put(run: ScrapeRun): Promise<void>` (Task 1), `logger` de `@/shared/logger`, `SourceResult { sourceId; fetched; created; updated; unchanged; error? }` existente.
- Produces: `Deps` gana `scrapeRunRepo: Pick<ScrapeRunRepo, "put">` y `nowMs: () => number` (reloj inyectable para `durationMs` determinista en tests). La firma pública `runScrape(now: string, deps?: Partial<Deps>): Promise<SourceResult[]>` NO cambia.

### Steps

- [ ] Añadir al final de `backend/src/scraper/__tests__/orchestrator.test.ts` (dentro del `describe("runScrape", …)` existente, reutilizando los helpers `srcRepo`, `ok` y `bad` ya definidos en ese archivo):

```ts
describe("historial de scrapes (ScrapeRun)", () => {
  const okConnector = {
    fetchItems: async () => [
      {
        category: "reportes" as const,
        sourceId: "ok",
        externalId: "1",
        titulo: "t",
        texto: "x",
        raw: {},
      },
    ],
  };

  it("persiste un resumen de la corrida al terminar", async () => {
    const put = vi.fn(async () => {});
    const deps = {
      sourceRepo: srcRepo([ok, bad]),
      itemRepo: { upsert: vi.fn(async () => "created" as const) },
      seed: vi.fn(async () => {}),
      getConnector: (id: string) => (id === "ok" ? okConnector : undefined),
      scrapeRunRepo: { put },
      nowMs: () => Date.parse("2026-07-02T00:05:00Z"),
    };
    await runScrape("2026-07-02T00:00:00Z", deps as any);
    expect(put).toHaveBeenCalledOnce();
    expect((put as any).mock.calls[0][0]).toMatchObject({
      ts: "2026-07-02T00:00:00Z",
      durationMs: 300000,
      sourcesTotal: 2,
      sourcesOk: 1,
      sourcesError: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      errors: [{ sourceId: "bad", error: "no connector for bad" }],
    });
  });

  it("un fallo al guardar el historial NO rompe el scrape (best-effort)", async () => {
    const deps = {
      sourceRepo: srcRepo([ok]),
      itemRepo: { upsert: vi.fn(async () => "created" as const) },
      seed: vi.fn(async () => {}),
      getConnector: () => okConnector,
      scrapeRunRepo: {
        put: vi.fn(async () => {
          throw new Error("ddb caído");
        }),
      },
      nowMs: () => Date.now(),
    };
    const results = await runScrape("2026-07-02T00:00:00Z", deps as any);
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeUndefined();
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/scraper/__tests__/orchestrator.test.ts` → el primer test falla con `expected "spy" to be called once` (`put` nunca se invoca).
- [ ] Implementación mínima en `backend/src/scraper/orchestrator.ts`. Imports nuevos (arriba, junto a los repos):

```ts
import { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
import { logger } from "@/shared/logger";
```

En `interface Deps` añadir:

```ts
scrapeRunRepo: Pick<ScrapeRunRepo, "put">;
nowMs: () => number;
```

Al final de `runScrape`, reemplazar el `return results;` por:

```ts
// Historial de scrapes (best-effort): resuelve el "fire-and-forget" — el
// admin ve cuándo terminó de verdad cada corrida. Un fallo al guardar el
// historial NO puede romper el scrape que acaba de completarse.
const scrapeRunRepo = deps?.scrapeRunRepo ?? new ScrapeRunRepo();
const nowMs = deps?.nowMs ?? Date.now;
try {
  const failed = results.filter((r) => r.error);
  await scrapeRunRepo.put({
    ts: now,
    durationMs: Math.max(0, nowMs() - Date.parse(now)),
    sourcesTotal: results.length,
    sourcesOk: results.length - failed.length,
    sourcesError: failed.length,
    created: results.reduce((n, r) => n + r.created, 0),
    updated: results.reduce((n, r) => n + r.updated, 0),
    unchanged: results.reduce((n, r) => n + r.unchanged, 0),
    errors: failed.slice(0, 10).map((r) => ({
      sourceId: r.sourceId,
      error: (r.error ?? "").slice(0, 300),
    })),
  });
} catch (err) {
  logger.warn("no se pudo guardar el historial del scrape", { err });
}
return results;
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/scraper/__tests__/orchestrator.test.ts` → todos los tests del archivo pasan (los preexistentes no inyectan `scrapeRunRepo`; el default `new ScrapeRunRepo()` no llega a DynamoDB real en tests… **ojo**: sí lo intentaría. Para que los tests preexistentes no toquen la red, el `mockClient` no está en ese archivo → el `PutCommand` fallaría y caería en el `catch` (best-effort) con un `logger.warn`. Eso es aceptable y los tests siguen verdes; verificarlo en la salida).
- [ ] Commit: `git add backend/src/scraper && git commit -m "✨ feat(scraper): persiste el historial de cada corrida (ScrapeRun, best-effort)"`

---

## Task 3 — `getSnapshotUpdatedAt` (HeadObject S3 con try/catch)

**Files:**

- Create: `backend/src/admin-api/snapshotHead.ts`
- Create: `backend/src/admin-api/__tests__/snapshotHead.test.ts`

**Interfaces:**

- Produces: `getSnapshotUpdatedAt(deps?: { s3?: Pick<S3Client, "send"> }): Promise<string | undefined>` — **contrato: nunca lanza**; devuelve el `LastModified` de `s3://$SNAPSHOT_BUCKET/snapshot.json` en ISO, o `undefined` si falta la env var o el HeadObject falla (logueando `warn`).
- Consumes: `S3Client`/`HeadObjectCommand` de `@aws-sdk/client-s3` (ya es dependencia del backend), `logger`.

### Steps

- [ ] Escribir `backend/src/admin-api/__tests__/snapshotHead.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSnapshotUpdatedAt } from "@/admin-api/snapshotHead";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
  vi.stubEnv("SNAPSHOT_BUCKET", "snap-bucket");
});
afterEach(() => vi.unstubAllEnvs());

describe("getSnapshotUpdatedAt", () => {
  it("devuelve el LastModified de snapshot.json en ISO", async () => {
    s3Mock.on(HeadObjectCommand).resolves({
      LastModified: new Date("2026-07-02T12:58:00Z"),
    });
    await expect(getSnapshotUpdatedAt()).resolves.toBe(
      "2026-07-02T12:58:00.000Z",
    );
    const input = s3Mock.commandCalls(HeadObjectCommand)[0].args[0].input;
    expect(input).toEqual({ Bucket: "snap-bucket", Key: "snapshot.json" });
  });

  it("devuelve undefined si el HeadObject falla (no tumba /stats)", async () => {
    s3Mock.on(HeadObjectCommand).rejects(new Error("AccessDenied"));
    await expect(getSnapshotUpdatedAt()).resolves.toBeUndefined();
  });

  it("devuelve undefined si la respuesta no trae LastModified", async () => {
    s3Mock.on(HeadObjectCommand).resolves({});
    await expect(getSnapshotUpdatedAt()).resolves.toBeUndefined();
  });

  it("devuelve undefined sin SNAPSHOT_BUCKET configurado (sin llamar a S3)", async () => {
    vi.stubEnv("SNAPSHOT_BUCKET", "");
    await expect(getSnapshotUpdatedAt()).resolves.toBeUndefined();
    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(0);
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/snapshotHead.test.ts` → `Cannot find module '@/admin-api/snapshotHead'`.
- [ ] Crear `backend/src/admin-api/snapshotHead.ts`:

```ts
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "@/shared/logger";

const moduleS3 = new S3Client({});

// LastModified del snapshot.json en S3 = fin del último scrape (la señal
// operativa correcta: el `generatedAt` interno se sella al INICIO de la
// corrida, ~11 min antes). Contrato: NUNCA lanza — si falta la env var o el
// HeadObject falla, devuelve undefined y /stats sale sin `snapshotUpdatedAt`.
export async function getSnapshotUpdatedAt(deps?: {
  s3?: Pick<S3Client, "send">;
}): Promise<string | undefined> {
  const s3 = deps?.s3 ?? moduleS3;
  const bucket = process.env.SNAPSHOT_BUCKET;
  if (!bucket) return undefined;
  try {
    const res = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: "snapshot.json" }),
    );
    return res.LastModified?.toISOString();
  } catch (err) {
    logger.warn("no se pudo leer el LastModified del snapshot", { err });
    return undefined;
  }
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/snapshotHead.test.ts` → 4 passed.
- [ ] Commit: `git add backend/src/admin-api && git commit -m "✨ feat(admin-api): lee el LastModified del snapshot vía HeadObject (nunca lanza)"`

---

## Task 4 — Router: query params + `GET /qa-logs/{chatId}`

**Files:**

- Modify: `backend/src/admin-api/router.ts` (imports ~línea 1–17, `RouteDeps` ~línea 19, firma de `route` ~línea 152, ruta nueva antes de `// GET /stats` ~línea 295)
- Create: `backend/src/admin-api/__tests__/router.observability.test.ts`

**Interfaces:**

- Produces: `route(method: string, path: string, body: unknown, deps: RouteDeps, query?: Record<string, string | undefined>): Promise<RouteResult>` (5º parámetro opcional con default `{}` — no rompe ningún llamador existente). `RouteDeps` gana `qaLogRepo: Pick<QaLogRepo, "listByChat">`. Respuesta de la ruta: `200` con `QaLogEntry[]` tal cual sale del repo (más reciente primero; `listByChat` ya hace `ScanIndexForward:false`).
- Consumes: `QaLogRepo.listByChat(chatId: string, limit = 50): Promise<QaLogEntry[]>` (ya existe).

### Steps

- [ ] Crear `backend/src/admin-api/__tests__/router.observability.test.ts` (crecerá en las Tasks 5–7):

```ts
import { describe, it, expect, vi } from "vitest";
import { route, type RouteDeps } from "@/admin-api/router";

const qaEntry = {
  chatId: "7",
  ts: "2026-07-02T00:00:00.000Z",
  pregunta: "¿dónde hay acopios?",
  respuesta: "Hay 3 acopios cerca de Caracas.",
  itemsUsados: ["acopios:a1"],
  tokensIn: 120,
  tokensOut: 80,
  modelo: "nova-lite",
  costoEstimado: 0.0001,
  flagged: false,
};

function makeDeps(over: Partial<RouteDeps> = {}): RouteDeps {
  return {
    qaLogRepo: { listByChat: vi.fn().mockResolvedValue([qaEntry]) },
    ...over,
  } as unknown as RouteDeps;
}

describe("admin-api router — observabilidad", () => {
  describe("GET /qa-logs/{chatId}", () => {
    it("devuelve las interacciones del chat con limit por defecto 50", async () => {
      const deps = makeDeps();
      const res = await route("GET", "/qa-logs/7", null, deps);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([qaEntry]);
      expect(deps.qaLogRepo.listByChat).toHaveBeenCalledWith("7", 50);
    });

    it("respeta ?limit= y lo acota a 200", async () => {
      const deps = makeDeps();
      await route("GET", "/qa-logs/7", null, deps, { limit: "500" });
      expect(deps.qaLogRepo.listByChat).toHaveBeenCalledWith("7", 200);
    });

    it("ignora un limit no numérico (usa el default)", async () => {
      const deps = makeDeps();
      await route("GET", "/qa-logs/7", null, deps, { limit: "abc" });
      expect(deps.qaLogRepo.listByChat).toHaveBeenCalledWith("7", 50);
    });
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/router.observability.test.ts` → `res.status` es `404` (la ruta no existe).
- [ ] Implementación mínima en `backend/src/admin-api/router.ts`. Import nuevo:

```ts
import type { QaLogRepo } from "@/shared/repos/qaLogRepo";
```

En `RouteDeps` (junto a `tgUserRepo`):

```ts
// Visor de Q&A del bot: Query por PK=QA#<chatId>, sin Scan.
qaLogRepo: Pick<QaLogRepo, "listByChat">;
```

Cambiar la firma de `route` (el 5º parámetro es opcional; ningún test/llamador existente cambia):

```ts
export async function route(
  method: string,
  path: string,
  body: unknown,
  deps: RouteDeps,
  query: Record<string, string | undefined> = {},
): Promise<RouteResult> {
```

Helper junto a `slugify` (~línea 140):

```ts
// Parsea ?limit= con default y techo (los endpoints de lectura del admin
// nunca devuelven páginas sin acotar).
function parseLimit(raw: string | undefined, def: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}
```

Ruta nueva, inmediatamente antes del bloque `// GET /stats`:

```ts
// GET /qa-logs/{chatId} — últimas interacciones Q&A de un chat del bot
const qaLogsM = path.match(/^\/qa-logs\/([^/]+)$/);
if (method === "GET" && qaLogsM) {
  const chatId = decodeURIComponent(qaLogsM[1]);
  const limit = parseLimit(query.limit, 50, 200);
  const logs = await deps.qaLogRepo.listByChat(chatId, limit);
  return { status: 200, body: logs };
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/router.observability.test.ts` → 3 passed. Correr también `npm test --workspace @venezuelahelp/backend -- src/admin-api` para confirmar que los tests preexistentes del router siguen verdes.
- [ ] Commit: `git add backend/src/admin-api && git commit -m "✨ feat(admin-api): endpoint GET /qa-logs/{chatId} con query params en el router"`

---

## Task 5 — Router: `GET /stats` gana `snapshotUpdatedAt`

**Files:**

- Modify: `backend/src/admin-api/router.ts` (`RouteDeps` y bloque `// GET /stats` ~línea 296–320)
- Modify: `backend/src/admin-api/__tests__/router.observability.test.ts` (añadir describe)

**Interfaces:**

- Produces: `RouteDeps` gana `snapshotUpdatedAt?: () => Promise<string | undefined>` (**opcional**: los tests existentes de `/stats` no lo inyectan y deben seguir verdes — un fallo nuevo no tumba flujos existentes). El body de `/stats` gana la clave `snapshotUpdatedAt` SOLO cuando el dep devuelve un valor.
- Consumes: `getSnapshotUpdatedAt` (Task 3) se cablea en el handler en la Task 8; el router solo conoce la función inyectada (contrato: nunca lanza).

### Steps

- [ ] Añadir a `router.observability.test.ts`:

```ts
describe("GET /stats — snapshotUpdatedAt", () => {
  const statsDeps = (snapshotUpdatedAt?: RouteDeps["snapshotUpdatedAt"]) =>
    makeDeps({
      itemRepo: {
        listByCategory: vi.fn().mockResolvedValue([]),
        countByCategory: vi.fn().mockResolvedValue(0),
      },
      sourceRepo: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
      snapshotUpdatedAt,
    } as unknown as Partial<RouteDeps>);

  it("incluye snapshotUpdatedAt cuando el dep lo devuelve", async () => {
    const deps = statsDeps(
      vi.fn().mockResolvedValue("2026-07-02T12:58:00.000Z"),
    );
    const res = await route("GET", "/stats", null, deps);
    expect(res.status).toBe(200);
    expect((res.body as { snapshotUpdatedAt?: string }).snapshotUpdatedAt).toBe(
      "2026-07-02T12:58:00.000Z",
    );
  });

  it("omite la clave cuando el dep devuelve undefined (HeadObject falló)", async () => {
    const deps = statsDeps(vi.fn().mockResolvedValue(undefined));
    const res = await route("GET", "/stats", null, deps);
    expect(res.status).toBe(200);
    expect("snapshotUpdatedAt" in (res.body as object)).toBe(false);
  });

  it("sigue funcionando sin el dep inyectado (compat)", async () => {
    const deps = statsDeps(undefined);
    const res = await route("GET", "/stats", null, deps);
    expect(res.status).toBe(200);
    expect("snapshotUpdatedAt" in (res.body as object)).toBe(false);
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/router.observability.test.ts` → el primer test del describe nuevo falla (`snapshotUpdatedAt` es `undefined` en el body).
- [ ] Implementación mínima. En `RouteDeps`:

```ts
  // Edad del snapshot público (LastModified en S3). Opcional y con contrato
  // "nunca lanza": si falta o devuelve undefined, /stats sale sin la clave.
  snapshotUpdatedAt?: () => Promise<string | undefined>;
```

En el bloque `// GET /stats`, tras construir `sources` y antes del `return`:

```ts
const snapshotUpdatedAt = deps.snapshotUpdatedAt
  ? await deps.snapshotUpdatedAt()
  : undefined;
return {
  status: 200,
  body: {
    counts,
    sources,
    ...(snapshotUpdatedAt ? { snapshotUpdatedAt } : {}),
  },
};
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/admin-api` → todo verde (incluidos los tests viejos de `/stats`, que no inyectan el dep).
- [ ] Commit: `git add backend/src/admin-api && git commit -m "✨ feat(admin-api): GET /stats expone snapshotUpdatedAt (ausente si S3 falla)"`

---

## Task 6 — Router: `GET /items/search` (reusa el query engine del data-api)

**Files:**

- Modify: `backend/src/admin-api/router.ts` (import de `QueryResult`, `RouteDeps`, schema Zod junto a los demás schemas ~línea 130, ruta nueva junto a `/qa-logs`)
- Modify: `backend/src/admin-api/__tests__/router.observability.test.ts`

**Interfaces:**

- Produces: `RouteDeps` gana `searchSnapshot: (params: { q?: string; category?: string; limit?: number }) => Promise<QueryResult>`. Ruta `GET /items/search?q=&category=&limit=` → `200 { items: PublicItem[]; total: number; nextCursor?: string }`, `400` si `category` no es válida o `limit` fuera de rango.
- Consumes: `QueryResult` de `@/data-api/query` (`{ items: PublicItem[]; total: number; nextCursor?: string }`); `CATEGORIES` de `@/shared/types` (ya importado en el router). La implementación real del dep (`queryItems(await loadSnapshot(), params)`) se cablea en la Task 8.

### Steps

- [ ] Añadir a `router.observability.test.ts`:

```ts
describe("GET /items/search", () => {
  const found = {
    category: "desaparecidos",
    sourceId: "s1",
    externalId: "e1",
    titulo: "Ana María Pérez",
    texto: "Vista por última vez en Caracas",
  };

  it("busca en el snapshot con q, category y limit (default 50)", async () => {
    const searchSnapshot = vi
      .fn()
      .mockResolvedValue({ items: [found], total: 1 });
    const deps = makeDeps({ searchSnapshot });
    const res = await route("GET", "/items/search", null, deps, {
      q: "ana",
      category: "desaparecidos",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [found], total: 1 });
    expect(searchSnapshot).toHaveBeenCalledWith({
      q: "ana",
      category: "desaparecidos",
      limit: 50,
    });
  });

  it("acepta limit explícito dentro del rango", async () => {
    const searchSnapshot = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const deps = makeDeps({ searchSnapshot });
    await route("GET", "/items/search", null, deps, { limit: "10" });
    expect(searchSnapshot).toHaveBeenCalledWith({
      q: undefined,
      category: undefined,
      limit: 10,
    });
  });

  it("rechaza una categoría inválida con 400", async () => {
    const searchSnapshot = vi.fn();
    const deps = makeDeps({ searchSnapshot });
    const res = await route("GET", "/items/search", null, deps, {
      category: "inventada",
    });
    expect(res.status).toBe(400);
    expect(searchSnapshot).not.toHaveBeenCalled();
  });

  it("rechaza limit fuera de rango con 400", async () => {
    const deps = makeDeps({ searchSnapshot: vi.fn() });
    const res = await route("GET", "/items/search", null, deps, {
      limit: "9999",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/router.observability.test.ts` → los tests nuevos reciben `404`.
- [ ] Implementación mínima. Import nuevo en el router:

```ts
import type { QueryResult } from "@/data-api/query";
```

En `RouteDeps`:

```ts
// Búsqueda sobre el snapshot público (mismo engine que el data-api /v1).
// Inyectado para que el router no conozca el fetch HTTP del snapshot.
searchSnapshot: (params: { q?: string; category?: string; limit?: number }) =>
  Promise<QueryResult>;
```

Schema junto a los demás (después de `patchSourceConfigSchema`):

```ts
const itemsSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
```

Ruta nueva, justo después del bloque de `/qa-logs/{chatId}`:

```ts
// GET /items/search — búsqueda de ítems sobre el snapshot (no toca DynamoDB)
if (method === "GET" && path === "/items/search") {
  const parsed = itemsSearchQuerySchema.safeParse({
    q: query.q,
    category: query.category,
    limit: query.limit,
  });
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid query", issues: parsed.error.issues },
    };
  }
  const result = await deps.searchSnapshot({
    q: parsed.data.q,
    category: parsed.data.category,
    limit: parsed.data.limit ?? 50,
  });
  return { status: 200, body: result };
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/admin-api` → todo verde.
- [ ] Commit: `git add backend/src/admin-api && git commit -m "✨ feat(admin-api): endpoint GET /items/search reutilizando el query engine del data-api"`

---

## Task 7 — Router: `GET /scrape-runs`

**Files:**

- Modify: `backend/src/admin-api/router.ts` (`RouteDeps` + ruta junto a las anteriores)
- Modify: `backend/src/admin-api/__tests__/router.observability.test.ts`

**Interfaces:**

- Produces: `RouteDeps` gana `scrapeRunRepo: Pick<ScrapeRunRepo, "list">`. Ruta `GET /scrape-runs?limit=` → `200 ScrapeRun[]` (default 10, techo 50).
- Consumes: `ScrapeRunRepo.list(limit = 10): Promise<ScrapeRun[]>` (Task 1).

### Steps

- [ ] Añadir a `router.observability.test.ts`:

```ts
describe("GET /scrape-runs", () => {
  const run = {
    ts: "2026-07-02T00:28:00.000Z",
    durationMs: 660000,
    sourcesTotal: 11,
    sourcesOk: 10,
    sourcesError: 1,
    created: 12,
    updated: 340,
    unchanged: 45000,
    errors: [{ sourceId: "bad", error: "HTTP 500" }],
  };

  it("lista las últimas corridas (default 10)", async () => {
    const list = vi.fn().mockResolvedValue([run]);
    const deps = makeDeps({ scrapeRunRepo: { list } });
    const res = await route("GET", "/scrape-runs", null, deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([run]);
    expect(list).toHaveBeenCalledWith(10);
  });

  it("respeta ?limit= acotado a 50", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ scrapeRunRepo: { list } });
    await route("GET", "/scrape-runs", null, deps, { limit: "100" });
    expect(list).toHaveBeenCalledWith(50);
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/router.observability.test.ts` → `404`.
- [ ] Implementación mínima. Import y `RouteDeps`:

```ts
import type { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
```

```ts
// Historial de scrapes: Query sobre la partición SCRAPERUN, nunca Scan.
scrapeRunRepo: Pick<ScrapeRunRepo, "list">;
```

Ruta nueva, después de `/items/search`:

```ts
// GET /scrape-runs — historial de corridas del scraper
if (method === "GET" && path === "/scrape-runs") {
  const limit = parseLimit(query.limit, 10, 50);
  const runs = await deps.scrapeRunRepo.list(limit);
  return { status: 200, body: runs };
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend -- src/admin-api` → todo verde.
- [ ] Commit: `git add backend/src/admin-api && git commit -m "✨ feat(admin-api): endpoint GET /scrape-runs (historial de corridas)"`

---

## Task 8 — Handler: cablear deps nuevos y pasar `queryStringParameters`

**Files:**

- Modify: `backend/src/admin-api/handler.ts` (imports, `HandlerEvent` ~línea 19, `routeDeps` ~línea 64, llamada a `routeFn` ~línea 86)
- Modify: `backend/src/admin-api/__tests__/handler.test.ts` (dos asserts existentes + un test nuevo)

**Interfaces:**

- Produces: `HandlerEvent` gana `queryStringParameters?: Record<string, string | undefined>`; el handler pasa `event.queryStringParameters ?? {}` como 5º argumento de `route()` y cablea `qaLogRepo`, `scrapeRunRepo`, `snapshotUpdatedAt: () => getSnapshotUpdatedAt()` y `searchSnapshot`.
- Consumes: `QaLogRepo` (`@/shared/repos/qaLogRepo`), `ScrapeRunRepo` (Task 1), `getSnapshotUpdatedAt` (Task 3), `loadSnapshot` (`@/data-api/snapshot`, usa `process.env.SNAPSHOT_URL`), `queryItems` (`@/data-api/query`).

### Steps

- [ ] **Actualizar los dos asserts existentes** de `handler.test.ts` que verifican los argumentos de `route` — al añadir el 5º argumento, `toHaveBeenCalledWith` con 4 args fallaría. En el test `"calls route with method, path, and undefined body when no body"` y en `"parses body JSON and passes parsed object to route"` cambiar a:

```ts
expect(stubRoute).toHaveBeenCalledWith(
  "GET",
  "/config",
  undefined,
  expect.any(Object),
  expect.any(Object),
);
```

(y respectivamente `"PUT", "/config", payload, expect.any(Object), expect.any(Object)`). Añadir además el test nuevo:

```ts
it("pasa queryStringParameters al router como 5º argumento", async () => {
  const handler = await load();
  const event = {
    requestContext: { http: { method: "GET" } },
    rawPath: "/items/search",
    queryStringParameters: { q: "ana", limit: "10" },
  };

  await handler(event, { route: stubRoute });

  expect(stubRoute).toHaveBeenCalledWith(
    "GET",
    "/items/search",
    undefined,
    expect.any(Object),
    { q: "ana", limit: "10" },
  );
});

it("cablea qaLogRepo, scrapeRunRepo, snapshotUpdatedAt y searchSnapshot en las deps", async () => {
  const handler = await load();
  const event = {
    requestContext: { http: { method: "GET" } },
    rawPath: "/config",
  };

  await handler(event, { route: stubRoute });

  const deps = stubRoute.mock.calls[0][3];
  expect(deps.qaLogRepo).toBeDefined();
  expect(deps.scrapeRunRepo).toBeDefined();
  expect(typeof deps.snapshotUpdatedAt).toBe("function");
  expect(typeof deps.searchSnapshot).toBe("function");
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/backend -- src/admin-api/__tests__/handler.test.ts` → los tests nuevos fallan (`stubRoute` recibe 4 args; `deps.qaLogRepo` es `undefined`). Los dos asserts editados también fallan aún (el handler todavía pasa 4 args) — correcto: rojo antes de implementar.
- [ ] Implementación mínima en `handler.ts`. Imports nuevos:

```ts
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { ScrapeRunRepo } from "@/shared/repos/scrapeRunRepo";
import { getSnapshotUpdatedAt } from "@/admin-api/snapshotHead";
import { loadSnapshot } from "@/data-api/snapshot";
import { queryItems } from "@/data-api/query";
```

En `HandlerEvent`:

```ts
  queryStringParameters?: Record<string, string | undefined>;
```

En `routeDeps` (tras `apiKeyRepo`):

```ts
    qaLogRepo: new QaLogRepo(),
    scrapeRunRepo: new ScrapeRunRepo(),
    // Nunca lanza: HeadObject con try/catch dentro del módulo.
    snapshotUpdatedAt: () => getSnapshotUpdatedAt(),
    // Mismo engine y misma URL pública que el data-api /v1 (SNAPSHOT_URL).
    searchSnapshot: async (params: {
      q?: string;
      category?: string;
      limit?: number;
    }) => queryItems(await loadSnapshot(), params),
```

Y la llamada:

```ts
const result = await routeFn(
  method,
  event.rawPath,
  parsedBody,
  routeDeps,
  event.queryStringParameters ?? {},
);
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/backend` (suite backend completa) → todo verde.
- [ ] Commit: `git add backend/src/admin-api && git commit -m "🔌 feat(admin-api): cablea qa-logs, scrape-runs, búsqueda y HeadObject en el handler"`

---

## Task 9 — frontend-admin: tipos + cliente `api.ts`

**Files:**

- Modify: `frontend-admin/src/types.ts` (añadir `snapshotUpdatedAt?` a `Stats` ~línea 56; tipos nuevos al final)
- Modify: `frontend-admin/src/api.ts` (interface `Api` ~línea 18 y objeto retornado ~línea 81)
- Create: `frontend-admin/src/__tests__/api.observability.test.ts`

**Interfaces:**

- Produces (tipos): `QaLogEntry`, `SearchItem`, `SearchResult`, `ScrapeRun`, `ScrapeRunError`; `Stats.snapshotUpdatedAt?: string`. (API client): `getQaLogs(chatId: number, limit?: number): Promise<QaLogEntry[]>`, `searchItems(params: { q?: string; category?: string; limit?: number }): Promise<SearchResult>`, `getScrapeRuns(limit?: number): Promise<ScrapeRun[]>`.
- Consumes: el helper `request<T>(path, method, body?)` existente de `createApi` (token Cognito + `HTTP <status>` en error).

### Steps

- [ ] Crear `frontend-admin/src/__tests__/api.observability.test.ts` (mismo estilo que `api.apiprogram.test.ts`):

```ts
import { createApi } from "@/api";

const API_URL = "https://api.example.com";

function makeGetToken() {
  return vi.fn().mockResolvedValue("tok");
}

function makeOkFetch(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("createApi — observabilidad", () => {
  it("getQaLogs llama GET /qa-logs/{chatId}?limit=50", async () => {
    const fetch = makeOkFetch([{ ts: "t1" }]);
    const api = createApi(API_URL, makeGetToken(), { fetch });
    const res = await api.getQaLogs(7);
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/qa-logs/7?limit=50`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(res).toEqual([{ ts: "t1" }]);
  });

  it("searchItems arma el query string con q, category y limit", async () => {
    const fetch = makeOkFetch({ items: [], total: 0 });
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.searchItems({ q: "ana maría", category: "desaparecidos" });
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/items/search?q=ana+mar%C3%ADa&category=desaparecidos&limit=50`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("searchItems omite q y category vacíos", async () => {
    const fetch = makeOkFetch({ items: [], total: 0 });
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.searchItems({ category: "acopios", limit: 20 });
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/items/search?category=acopios&limit=20`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("getScrapeRuns llama GET /scrape-runs?limit=10", async () => {
    const fetch = makeOkFetch([]);
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.getScrapeRuns();
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/scrape-runs?limit=10`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/frontend-admin -- src/__tests__/api.observability.test.ts` → `api.getQaLogs is not a function`.
- [ ] Implementación mínima. En `frontend-admin/src/types.ts`, añadir a `Stats` la línea `snapshotUpdatedAt?: string;` (después de `counts`), y al final del archivo:

```ts
// ── Observabilidad (Bloques A y B) ──────────────────────────────────────────

// Interacción Q&A del bot (lo que devuelve GET /qa-logs/{chatId}).
// `intent` llega cuando el Bloque C (telemetría del bot) esté desplegado.
export interface QaLogEntry {
  ts: string;
  pregunta: string;
  respuesta: string;
  intent?: string;
  itemsUsados: string[];
  tokensIn: number;
  tokensOut: number;
  modelo: string;
  costoEstimado: number;
  flagged: boolean;
}

// Ítem del snapshot tal como lo devuelve GET /items/search.
export interface SearchItem {
  category: string;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: { lat: number; lng: number; nombre?: string };
  status?: string;
  sourceUrl?: string;
  trust?: string;
  isCanonical?: boolean;
  sourcesCount?: number;
}

export interface SearchResult {
  items: SearchItem[];
  total: number;
  nextCursor?: string;
}

export interface ScrapeRunError {
  sourceId: string;
  error: string;
}

export interface ScrapeRun {
  ts: string;
  durationMs: number;
  sourcesTotal: number;
  sourcesOk: number;
  sourcesError: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: ScrapeRunError[];
}
```

En `frontend-admin/src/api.ts`: ampliar el import de tipos con `QaLogEntry, SearchResult, ScrapeRun`; añadir a la interface `Api`:

```ts
  getQaLogs(chatId: number, limit?: number): Promise<QaLogEntry[]>;
  searchItems(params: {
    q?: string;
    category?: string;
    limit?: number;
  }): Promise<SearchResult>;
  getScrapeRuns(limit?: number): Promise<ScrapeRun[]>;
```

y al objeto retornado por `createApi` (antes del cierre):

```ts
    getQaLogs(chatId: number, limit = 50): Promise<QaLogEntry[]> {
      return request<QaLogEntry[]>(`/qa-logs/${chatId}?limit=${limit}`, "GET");
    },

    searchItems(params: {
      q?: string;
      category?: string;
      limit?: number;
    }): Promise<SearchResult> {
      const qs = new URLSearchParams();
      if (params.q) qs.set("q", params.q);
      if (params.category) qs.set("category", params.category);
      qs.set("limit", String(params.limit ?? 50));
      return request<SearchResult>(`/items/search?${qs.toString()}`, "GET");
    },

    getScrapeRuns(limit = 10): Promise<ScrapeRun[]> {
      return request<ScrapeRun[]>(`/scrape-runs?limit=${limit}`, "GET");
    },
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/frontend-admin -- src/__tests__/api.observability.test.ts` → 4 passed.
- [ ] Commit: `git add frontend-admin/src && git commit -m "✨ feat(frontend-admin): cliente API de observabilidad (qa-logs, items/search, scrape-runs)"`

---

## Task 10 — Componente `QaLogDrawer`

**Files:**

- Create: `frontend-admin/src/components/QaLogDrawer.tsx`
- Create: `frontend-admin/src/components/QaLogDrawer.module.css`
- Create: `frontend-admin/src/components/__tests__/qaLogDrawer.test.tsx`

**Interfaces:**

- Produces: `function QaLogDrawer(props: { user: TgUser; loadQa: (chatId: number) => Promise<QaLogEntry[]>; onClose: () => void }): JSX.Element` — drawer lateral (`role="dialog"`) con estados loading/error/empty, botón «Actualizar», botón «Cerrar», lista acotada (max-height + scroll interno), respuesta truncada a 180 chars expandible.
- Consumes: tipos `TgUser`, `QaLogEntry` de `@/types`.

### Steps

- [ ] Crear `frontend-admin/src/components/__tests__/qaLogDrawer.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { QaLogDrawer } from "@/components/QaLogDrawer";
import type { QaLogEntry, TgUser } from "@/types";

const user: TgUser = {
  chatId: 7,
  username: "ana",
  nombre: "Ana P",
  firstSeenAt: "2026-06-01T00:00:00Z",
  lastSeenAt: "2026-07-01T00:00:00Z",
  msgCount: 9,
};

const logs: QaLogEntry[] = [
  {
    ts: "2026-07-02T00:00:00.000Z",
    pregunta: "¿dónde hay acopios?",
    respuesta: "Hay 3 acopios cerca de Caracas.",
    intent: "rag_retrieve",
    itemsUsados: ["acopios:a1"],
    tokensIn: 120,
    tokensOut: 80,
    modelo: "nova-lite",
    costoEstimado: 0.0001,
    flagged: false,
  },
];

describe("QaLogDrawer", () => {
  it("carga y muestra las interacciones del chat (con badge de intent)", async () => {
    const loadQa = vi.fn().mockResolvedValue(logs);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    expect(loadQa).toHaveBeenCalledWith(7);
    expect(await screen.findByText("¿dónde hay acopios?")).toBeInTheDocument();
    expect(screen.getByText("rag_retrieve")).toBeInTheDocument();
    expect(screen.getByText("nova-lite")).toBeInTheDocument();
  });

  it("muestra el vacío cuando no hay interacciones", async () => {
    const loadQa = vi.fn().mockResolvedValue([]);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    expect(
      await screen.findByText("Este usuario aún no tiene interacciones."),
    ).toBeInTheDocument();
  });

  it("muestra error si la carga falla", async () => {
    const loadQa = vi.fn().mockRejectedValue(new Error("500"));
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las interacciones.",
    );
  });

  it("trunca respuestas largas y las expande con «Ver más»", async () => {
    const larga = "x".repeat(300);
    const loadQa = vi
      .fn()
      .mockResolvedValue([{ ...logs[0], respuesta: larga }]);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    const btn = await screen.findByRole("button", { name: "Ver más" });
    fireEvent.click(btn);
    expect(screen.getByText(larga)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver menos" }),
    ).toBeInTheDocument();
  });

  it("llama onClose al cerrar y recarga con «Actualizar»", async () => {
    const onClose = vi.fn();
    const loadQa = vi.fn().mockResolvedValue([]);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={onClose} />);
    await screen.findByText("Este usuario aún no tiene interacciones.");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(loadQa).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/qaLogDrawer.test.tsx` → `Cannot find module '@/components/QaLogDrawer'`.
- [ ] Crear `frontend-admin/src/components/QaLogDrawer.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import type { QaLogEntry, TgUser } from "@/types";
import styles from "./QaLogDrawer.module.css";

interface QaLogDrawerProps {
  user: TgUser;
  loadQa: (chatId: number) => Promise<QaLogEntry[]>;
  onClose: () => void;
}

const TRUNCATE_AT = 180;

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function QaLogDrawer({ user, loadQa, onClose }: QaLogDrawerProps) {
  const [logs, setLogs] = useState<QaLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await loadQa(user.chatId));
    } catch {
      setError("No se pudieron cargar las interacciones.");
    } finally {
      setLoading(false);
    }
  }, [loadQa, user.chatId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <aside
      className={styles.drawer}
      role="dialog"
      aria-label={`Q&A de ${user.nombre || user.chatId}`}
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>
            Q&A · {user.nombre || `chat ${user.chatId}`}
          </h3>
          {user.username && (
            <span className={styles.subtitle}>@{user.username}</span>
          )}
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void refresh()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Cargando…" : "Actualizar"}
          </button>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!error && logs === null && (
        <p className={styles.empty} role="status">
          Cargando interacciones…
        </p>
      )}
      {!error && logs !== null && logs.length === 0 && (
        <p className={styles.empty}>Este usuario aún no tiene interacciones.</p>
      )}

      {logs !== null && logs.length > 0 && (
        // Lista acotada + scroll propio (convención de listas del proyecto).
        <ul className={styles.list} role="list">
          {logs.map((l) => {
            const isOpen = expanded === l.ts;
            const truncated = l.respuesta.length > TRUNCATE_AT && !isOpen;
            const respuesta = truncated
              ? `${l.respuesta.slice(0, TRUNCATE_AT)}…`
              : l.respuesta;
            return (
              <li key={l.ts} className={styles.entry}>
                <div className={styles.entryHead}>
                  <span className={styles.when}>{formatTs(l.ts)}</span>
                  {l.intent && (
                    <span className={styles.intent}>{l.intent}</span>
                  )}
                  {l.flagged && <span className={styles.flagged}>⚑ flag</span>}
                </div>
                <p className={styles.pregunta}>{l.pregunta}</p>
                <p className={styles.respuesta}>{respuesta}</p>
                {l.respuesta.length > TRUNCATE_AT && (
                  <button
                    type="button"
                    className={styles.expandButton}
                    onClick={() => setExpanded(isOpen ? null : l.ts)}
                  >
                    {isOpen ? "Ver menos" : "Ver más"}
                  </button>
                )}
                <div className={styles.meta}>
                  <span>{l.modelo}</span>
                  <span>
                    {l.tokensIn}→{l.tokensOut} tokens
                  </span>
                  <span>${l.costoEstimado.toFixed(5)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
```

Crear `frontend-admin/src/components/QaLogDrawer.module.css`:

```css
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw);
  background-color: var(--surface, #fff);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 16px;
  z-index: 20;
  overflow: hidden;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.headText {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle {
  font-size: 0.8125rem;
  color: var(--muted);
}

.headActions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.refreshButton {
  padding: 6px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  font-size: 0.875rem;
  font-family: var(--font-sans);
  font-weight: 600;
  cursor: pointer;
  background-color: var(--surface);
  color: var(--ink-strong);
}

.refreshButton:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.closeButton {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: none;
  font-size: 0.875rem;
  cursor: pointer;
  color: var(--muted);
}

.error {
  margin: 0;
  font-size: 0.875rem;
  color: #b42318;
  background: #fde8e8;
  padding: 8px 12px;
  border-radius: 10px;
}

.empty {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--muted);
}

/* Altura acotada + scroll propio: 50 interacciones no alargan la página. */
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.entry:last-child {
  border-bottom: none;
}

.entryHead {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.when {
  font-size: 0.75rem;
  color: var(--muted);
  white-space: nowrap;
}

.intent {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  background-color: var(--primary-tint, #eef2ff);
  color: var(--primary-strong, #3538cd);
  white-space: nowrap;
}

.flagged {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #b54708;
}

.pregunta {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink-strong);
}

.respuesta {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.expandButton {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary-strong, #3538cd);
  cursor: pointer;
}

.meta {
  display: flex;
  gap: 10px;
  font-size: 0.6875rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/qaLogDrawer.test.tsx` → 5 passed.
- [ ] Commit: `git add frontend-admin/src/components && git commit -m "✨ feat(frontend-admin): drawer de Q&A por usuario (QaLogDrawer)"`

---

## Task 11 — `Users.tsx`: fila clicable abre el drawer

**Files:**

- Modify: `frontend-admin/src/components/Users.tsx` (props ~línea 4, estado + `<tr>` ~línea 88, render del drawer al final)
- Modify: `frontend-admin/src/components/Users.module.css` (clase `.rowClickable`)
- Modify: `frontend-admin/src/components/__tests__/users.test.tsx` (tests nuevos al final del describe)

**Interfaces:**

- Produces: `UsersProps` gana `onLoadQa?: (chatId: number) => Promise<QaLogEntry[]>`. Con la prop presente, cada `<tr>` es clicable y abre `QaLogDrawer` para ese usuario; el botón Bloquear hace `stopPropagation`. Sin la prop, comportamiento idéntico al actual.
- Consumes: `QaLogDrawer` (Task 10), `QaLogEntry` de `@/types`.

### Steps

- [ ] Añadir a `frontend-admin/src/components/__tests__/users.test.tsx` (dentro del `describe("Users", …)`; añadir `fireEvent` ya está importado):

```tsx
it("abre el drawer de Q&A al hacer click en una fila", async () => {
  const onLoadQa = vi.fn().mockResolvedValue([]);
  render(<Users users={users} onLoadQa={onLoadQa} />);
  fireEvent.click(screen.getByText("Ana P"));
  expect(onLoadQa).toHaveBeenCalledWith(1);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

it("cierra el drawer con su botón Cerrar", async () => {
  const onLoadQa = vi.fn().mockResolvedValue([]);
  render(<Users users={users} onLoadQa={onLoadQa} />);
  fireEvent.click(screen.getByText("Ana P"));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("el botón de bloqueo NO abre el drawer (stopPropagation)", () => {
  const onLoadQa = vi.fn().mockResolvedValue([]);
  const onToggleBlock = vi.fn();
  render(
    <Users users={users} onLoadQa={onLoadQa} onToggleBlock={onToggleBlock} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Bloquear" }));
  expect(onToggleBlock).toHaveBeenCalledOnce();
  expect(onLoadQa).not.toHaveBeenCalled();
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/users.test.tsx` → los 3 tests nuevos fallan (no existe `onLoadQa` ni el dialog).
- [ ] Implementación en `Users.tsx`. Imports:

```tsx
import { useState } from "react";
import type { QaLogEntry, TgUser } from "@/types";
import { QaLogDrawer } from "@/components/QaLogDrawer";
```

Props:

```tsx
  // Visor de Q&A: si está presente, click en una fila abre el drawer con las
  // últimas interacciones de ese chat.
  onLoadQa?: (chatId: number) => Promise<QaLogEntry[]>;
```

En el cuerpo del componente (tras destructurar props, añadiendo `onLoadQa`):

```tsx
const [selected, setSelected] = useState<TgUser | null>(null);
```

En el `<tr>`:

```tsx
                <tr
                  key={u.chatId}
                  onClick={onLoadQa ? () => setSelected(u) : undefined}
                  className={onLoadQa ? styles.rowClickable : undefined}
                >
```

En el botón de bloqueo, cambiar el `onClick` a:

```tsx
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBlock(u);
                        }}
```

Y antes del cierre del `div.root` (después del `tableWrap`):

```tsx
{
  selected && onLoadQa && (
    <QaLogDrawer
      user={selected}
      loadQa={onLoadQa}
      onClose={() => setSelected(null)}
    />
  );
}
```

En `Users.module.css` añadir:

```css
.rowClickable {
  cursor: pointer;
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/users.test.tsx` → todos pasan (los 4 preexistentes también).
- [ ] Commit: `git add frontend-admin/src/components && git commit -m "✨ feat(frontend-admin): abre el drawer de Q&A desde la tabla de usuarios"`

---

## Task 12 — Tab «Buscar» (`Search.tsx` con debounce)

**Files:**

- Create: `frontend-admin/src/components/Search.tsx`
- Create: `frontend-admin/src/components/Search.module.css`
- Create: `frontend-admin/src/components/__tests__/search.test.tsx`

**Interfaces:**

- Produces: `function Search(props: { onSearch: (params: { q?: string; category?: string; limit?: number }) => Promise<SearchResult>; sources?: Source[] | null }): JSX.Element` — input de búsqueda (`type="search"`) con debounce 300 ms + select de categoría + tabla acotada (título, categoría, fuente, confianza/«En N fuentes», status crudo, link «Ver original» con fallback a la home de la fuente).
- Consumes: `SearchResult`, `SearchItem`, `Source` de `@/types`; `CATEGORIES` de `@/categories`.

### Steps

- [ ] Crear `frontend-admin/src/components/__tests__/search.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { Search } from "@/components/Search";
import type { SearchResult, Source } from "@/types";

const result: SearchResult = {
  items: [
    {
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "e1",
      titulo: "Ana María Pérez",
      texto: "Vista por última vez en Caracas",
      trust: "corroborado",
      sourcesCount: 2,
      status: "buscando",
      sourceUrl: "https://fuente.example/ana",
    },
  ],
  total: 1,
};

const sources: Source[] = [
  {
    id: "s1",
    nombre: "Fuente 1",
    url: "https://fuente.example",
    connector: "rest",
    enabled: true,
  },
];

describe("Search", () => {
  it("busca con debounce y pinta la tabla de resultados", async () => {
    const onSearch = vi.fn().mockResolvedValue(result);
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ana" },
    });
    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        q: "ana",
        category: undefined,
        limit: 50,
      }),
    );
    expect(await screen.findByText("Ana María Pérez")).toBeInTheDocument();
    expect(screen.getByText("En 2 fuentes")).toBeInTheDocument();
    expect(screen.getByText("buscando")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver original" })).toHaveAttribute(
      "href",
      "https://fuente.example/ana",
    );
  });

  it("debounce: una sola llamada aunque se tipee rápido", async () => {
    const onSearch = vi.fn().mockResolvedValue(result);
    render(<Search onSearch={onSearch} sources={sources} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "an" } });
    fireEvent.change(input, { target: { value: "ana" } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(1));
    expect(onSearch).toHaveBeenCalledWith({
      q: "ana",
      category: undefined,
      limit: 50,
    });
  });

  it("filtra por categoría sin texto", async () => {
    const onSearch = vi.fn().mockResolvedValue({ items: [], total: 0 });
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "acopios" },
    });
    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        q: undefined,
        category: "acopios",
        limit: 50,
      }),
    );
    expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
  });

  it("sin sourceUrl, «Ver original» cae a la home de la fuente", async () => {
    const onSearch = vi.fn().mockResolvedValue({
      items: [{ ...result.items[0], sourceUrl: undefined }],
      total: 1,
    });
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ana" },
    });
    expect(
      await screen.findByRole("link", { name: "Ver original" }),
    ).toHaveAttribute("href", "https://fuente.example");
  });

  it("muestra error si la búsqueda falla", async () => {
    const onSearch = vi.fn().mockRejectedValue(new Error("500"));
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ana" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo buscar.",
    );
  });

  it("estado inicial: instrucciones, sin llamar al API", () => {
    const onSearch = vi.fn();
    render(<Search onSearch={onSearch} sources={sources} />);
    expect(
      screen.getByText(
        "Escribí un término o elegí una categoría para buscar en el snapshot.",
      ),
    ).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/search.test.tsx` → `Cannot find module '@/components/Search'`.
- [ ] Crear `frontend-admin/src/components/Search.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult, Source } from "@/types";
import { CATEGORIES } from "@/categories";
import styles from "./Search.module.css";

interface SearchProps {
  onSearch: (params: {
    q?: string;
    category?: string;
    limit?: number;
  }) => Promise<SearchResult>;
  sources?: Source[] | null;
}

const DEBOUNCE_MS = 300;

export function Search({ onSearch, sources }: SearchProps) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Secuencia para descartar respuestas fuera de orden (última búsqueda gana).
  const seqRef = useRef(0);

  const sourceHomes = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sources ?? []) map.set(s.id, s.url);
    return map;
  }, [sources]);

  useEffect(() => {
    if (q.trim() === "" && category === "") {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      onSearch({
        q: q.trim() || undefined,
        category: category || undefined,
        limit: 50,
      })
        .then((r) => {
          if (seqRef.current === seq) setResult(r);
        })
        .catch(() => {
          if (seqRef.current === seq) setError("No se pudo buscar.");
        })
        .finally(() => {
          if (seqRef.current === seq) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, category, onSearch]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Buscar ítems</h2>
        {loading && (
          <span className={styles.loading} role="status">
            Buscando…
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <input
          type="search"
          className={styles.input}
          placeholder="Nombre, lugar, palabra clave…"
          aria-label="Buscar ítems"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={styles.select}
          aria-label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!error && result === null && (
        <p className={styles.empty}>
          Escribí un término o elegí una categoría para buscar en el snapshot.
        </p>
      )}

      {!error && result !== null && result.items.length === 0 && (
        <p className={styles.empty}>Sin resultados.</p>
      )}

      {!error && result !== null && result.items.length > 0 && (
        <>
          <p className={styles.total}>
            {result.total} resultado{result.total === 1 ? "" : "s"} (mostrando{" "}
            {result.items.length})
          </p>
          {/* Altura acotada + scroll propio (convención del proyecto). */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Fuente</th>
                  <th scope="col">Confianza</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Enlace" />
                </tr>
              </thead>
              <tbody>
                {result.items.map((it) => {
                  const href = it.sourceUrl ?? sourceHomes.get(it.sourceId);
                  return (
                    <tr key={`${it.sourceId}#${it.externalId}`}>
                      <td>
                        <div className={styles.titulo}>{it.titulo || "—"}</div>
                        <div className={styles.texto}>
                          {it.texto.slice(0, 120)}
                        </div>
                      </td>
                      <td className={styles.cell}>{it.category}</td>
                      <td className={styles.cell}>{it.sourceId}</td>
                      <td className={styles.cell}>
                        {it.trust ?? "—"}
                        {(it.sourcesCount ?? 0) >= 2 && (
                          <span className={styles.badgeSources}>
                            En {it.sourcesCount} fuentes
                          </span>
                        )}
                      </td>
                      <td className={styles.cell}>{it.status ?? "—"}</td>
                      <td className={styles.cell}>
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            Ver original
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
```

Crear `frontend-admin/src/components/Search.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 920px;
  padding: 24px 16px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.heading {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink-strong);
  margin: 0;
  letter-spacing: -0.01em;
}

.loading {
  font-size: 0.8125rem;
  color: var(--muted);
}

.controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.input {
  flex: 1;
  min-width: 220px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  font-size: 0.9375rem;
  font-family: var(--font-sans);
  color: var(--ink-strong);
  background-color: var(--surface);
}

.select {
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  font-size: 0.9375rem;
  font-family: var(--font-sans);
  color: var(--ink-strong);
  background-color: var(--surface);
}

.error {
  margin: 0;
  font-size: 0.875rem;
  color: #b42318;
  background: #fde8e8;
  padding: 8px 12px;
  border-radius: 10px;
}

.empty {
  font-size: 0.9375rem;
  color: var(--muted);
  margin: 0;
}

.total {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* Altura acotada + scroll propio: 50 resultados no alargan la página. */
.tableWrap {
  max-height: 480px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: var(--surface);
  text-align: left;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.table tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--ink);
  vertical-align: top;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.titulo {
  font-weight: 500;
  color: var(--ink-strong);
}

.texto {
  font-size: 0.75rem;
  color: var(--muted);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell {
  white-space: nowrap;
}

.badgeSources {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  background: #e6f4ea;
  color: #1a7f37;
  white-space: nowrap;
}

.link {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary-strong, #3538cd);
  white-space: nowrap;
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/search.test.tsx` → 6 passed.
- [ ] Commit: `git add frontend-admin/src/components && git commit -m "✨ feat(frontend-admin): tab Buscar con debounce sobre el snapshot"`

---

## Task 13 — `Dashboard.tsx`: edad del snapshot + «Últimos scrapes»

**Files:**

- Modify: `frontend-admin/src/components/Dashboard.tsx` (props ~línea 5, secciones nuevas)
- Modify: `frontend-admin/src/components/Dashboard.module.css` (estilos nuevos al final)
- Modify: `frontend-admin/src/components/__tests__/dashboard.test.tsx` (describe nuevo, autocontenido)

**Interfaces:**

- Produces: `DashboardProps` gana `scrapeRateMin?: number` (default 30 si no llega) y `scrapeRuns?: ScrapeRun[] | null`. Render: sección «Snapshot público» (solo si `stats.snapshotUpdatedAt` existe — feature-detect de snapshots/API viejos) con «Actualizado hace X» y aviso amarillo (`role="alert"`) si `edadMin > 2 × scrapeRateMin`; sección «Últimos scrapes» (solo si hay corridas) con tabla acotada.
- Consumes: `Stats.snapshotUpdatedAt?` y `ScrapeRun` de `@/types` (Task 9).

### Steps

- [ ] Añadir al final de `frontend-admin/src/components/__tests__/dashboard.test.tsx` un describe autocontenido (no toca los tests existentes):

```tsx
describe("Dashboard — observabilidad", () => {
  const baseStats = {
    counts: { reportes: 1 },
    sources: [],
  };

  const run = {
    ts: "2026-07-02T00:28:00.000Z",
    durationMs: 660000,
    sourcesTotal: 11,
    sourcesOk: 10,
    sourcesError: 1,
    created: 12,
    updated: 340,
    unchanged: 45000,
    errors: [{ sourceId: "bad", error: "HTTP 500" }],
  };

  it("muestra la edad del snapshot cuando es reciente (sin alerta)", () => {
    const stats = {
      ...baseStats,
      snapshotUpdatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    };
    render(<Dashboard stats={stats} scrapeRateMin={30} />);
    expect(screen.getByText(/Actualizado hace 5 min/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("avisa en amarillo cuando la edad supera 2× scrapeRateMin", () => {
    const stats = {
      ...baseStats,
      snapshotUpdatedAt: new Date(Date.now() - 90 * 60000).toISOString(),
    };
    render(<Dashboard stats={stats} scrapeRateMin={30} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/revisar el scraper/);
  });

  it("no pinta la sección de snapshot sin snapshotUpdatedAt (feature-detect)", () => {
    render(<Dashboard stats={baseStats} />);
    expect(screen.queryByText(/Actualizado hace/)).not.toBeInTheDocument();
  });

  it("lista los últimos scrapes con duración e ítems", () => {
    render(<Dashboard stats={baseStats} scrapeRuns={[run]} />);
    expect(screen.getByText("Últimos scrapes")).toBeInTheDocument();
    expect(screen.getByText("11 min")).toBeInTheDocument();
    expect(screen.getByText("10 ok")).toBeInTheDocument();
    expect(
      screen.getByText(/12 nuevos · 340 actualizados/),
    ).toBeInTheDocument();
  });

  it("sin corridas no pinta la sección", () => {
    render(<Dashboard stats={baseStats} scrapeRuns={[]} />);
    expect(screen.queryByText("Últimos scrapes")).not.toBeInTheDocument();
  });
});
```

(Si el archivo no importa ya `render`/`screen`/`Dashboard`, reutilizar los imports existentes del archivo; están al inicio.)

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/dashboard.test.tsx` → los 5 tests nuevos fallan.
- [ ] Implementación en `Dashboard.tsx`. Imports y props:

```tsx
import type { ScrapeRun, Stats } from "@/types";
```

```tsx
interface DashboardProps {
  stats: Stats;
  onRefresh?: () => void;
  refreshing?: boolean;
  // Intervalo de scrape configurado (Config.scrapeRateMin); default 30.
  scrapeRateMin?: number;
  scrapeRuns?: ScrapeRun[] | null;
}
```

Helpers junto a `formatRun`:

```tsx
function ageMinutes(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
}

function formatAge(min: number): string {
  return min < 120 ? `${min} min` : `${Math.round(min / 60)} h`;
}

function formatDuration(ms: number): string {
  return ms < 90000
    ? `${Math.round(ms / 1000)} s`
    : `${Math.round(ms / 60000)} min`;
}
```

Firma: `export function Dashboard({ stats, onRefresh, refreshing, scrapeRateMin, scrapeRuns }: DashboardProps)`. Tras el toolbar y antes de «Conteos por categoría», la sección de snapshot (feature-detect: `stats.snapshotUpdatedAt` no existe con un backend viejo):

```tsx
{
  stats.snapshotUpdatedAt &&
    (() => {
      const age = ageMinutes(stats.snapshotUpdatedAt);
      const rate = scrapeRateMin ?? 30;
      const stale = age > 2 * rate;
      return (
        <section className={styles.section}>
          <h2 className={styles.heading}>Snapshot público</h2>
          <p
            className={stale ? styles.snapshotStale : styles.snapshotOk}
            role={stale ? "alert" : undefined}
          >
            Actualizado hace {formatAge(age)}
            {stale &&
              ` — supera 2× el intervalo de scrape (${rate} min); revisar el scraper.`}
          </p>
        </section>
      );
    })();
}
```

Después de «Estado de fuentes», la sección de corridas:

```tsx
{
  scrapeRuns && scrapeRuns.length > 0 && (
    <section className={styles.section}>
      <h2 className={styles.heading}>Últimos scrapes</h2>
      {/* Altura acotada + scroll propio (convención del proyecto). */}
      <div className={styles.runsWrap}>
        <table className={styles.runsTable}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Duración</th>
              <th scope="col">Fuentes</th>
              <th scope="col">Ítems</th>
            </tr>
          </thead>
          <tbody>
            {scrapeRuns.map((r) => (
              <tr key={r.ts}>
                <td>{formatRun(r.ts)}</td>
                <td>{formatDuration(r.durationMs)}</td>
                <td>
                  <span className={styles.runOk}>{r.sourcesOk} ok</span>
                  {r.sourcesError > 0 && (
                    <span className={styles.runError}>
                      {" "}
                      · {r.sourcesError} error
                    </span>
                  )}
                </td>
                <td>
                  {r.created} nuevos · {r.updated} actualizados
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

Al final de `Dashboard.module.css`:

```css
/* ── observabilidad ── */
.snapshotOk {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--ink);
}

.snapshotStale {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #b54708;
  background: #fef0c7;
  padding: 8px 12px;
  border-radius: 10px;
}

.runsWrap {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.runsTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.runsTable thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: var(--surface);
  text-align: left;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.runsTable tbody td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--ink);
  white-space: nowrap;
}

.runsTable tbody tr:last-child td {
  border-bottom: none;
}

.runOk {
  color: #1a7f37;
  font-weight: 600;
}

.runError {
  color: #b42318;
  font-weight: 600;
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/frontend-admin -- src/components/__tests__/dashboard.test.tsx` → todos pasan.
- [ ] Commit: `git add frontend-admin/src/components && git commit -m "✨ feat(frontend-admin): Dashboard con edad del snapshot y últimos scrapes"`

---

## Task 14 — `App.tsx`: tab «Buscar» + wiring de datos

**Files:**

- Modify: `frontend-admin/src/App.tsx` (tipo `Tab` ~línea 31, imports, estado, `loadData` ~línea 90, `handleRefreshStats` ~línea 243, `handleSignOut`, `TAB_LABELS` ~línea 408, render de tabs ~línea 456)
- Modify: `frontend-admin/src/__tests__/App.test.tsx` (`buildMockApi` + test nuevo)

**Interfaces:**

- Produces: tab `search` («Buscar»); `Dashboard` recibe `scrapeRateMin={config?.scrapeRateMin}` y `scrapeRuns`; `Users` recibe `onLoadQa`; `Search` recibe `onSearch`/`sources`.
- Consumes: `api.getQaLogs` / `api.searchItems` / `api.getScrapeRuns` (Task 9), `Search` (Task 12). **`getScrapeRuns` va con `.catch(() => [])`** para que un fallo del endpoint nuevo no rompa la carga inicial del admin (constraint global).

### Steps

- [ ] Actualizar `frontend-admin/src/__tests__/App.test.tsx`: añadir a `buildMockApi()`:

```ts
    getQaLogs: vi.fn().mockResolvedValue([]),
    searchItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getScrapeRuns: vi.fn().mockResolvedValue([]),
```

y un test nuevo al final del archivo (mismo patrón `buildDeps` que los tests existentes):

```tsx
it("muestra el tab Buscar con su buscador", async () => {
  const { deps } = buildDeps(vi.fn().mockResolvedValue("token"));
  render(<App deps={deps} />);
  const tab = await screen.findByRole("button", { name: "Buscar" });
  await userEvent.click(tab);
  expect(await screen.findByRole("searchbox")).toBeInTheDocument();
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/frontend-admin -- src/__tests__/App.test.tsx` → el test nuevo falla (no existe el botón «Buscar»).
- [ ] Implementación en `App.tsx`:
  - Import: `import { Search } from "@/components/Search";` y añadir `ScrapeRun` al import de tipos de `@/types`.
  - `type Tab = "dashboard" | "analytics" | "users" | "search" | "sources" | "config" | "api";`
  - Estado: `const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[] | null>(null);`
  - `loadData`: ampliar el `Promise.all`:

```ts
const [s, src, cfg, an, users, reqs, keys, runs] = await Promise.all([
  api.getStats(),
  api.getSources(),
  api.getConfig(),
  api.getAnalytics(),
  api.getTgUsers(),
  api.getApiRequests(),
  api.getApiKeys(),
  // Best-effort: si la ruta nueva falla, el admin carga igual.
  api.getScrapeRuns().catch(() => [] as ScrapeRun[]),
]);
```

y tras `setApiKeys(keys);` añadir `setScrapeRuns(runs);`.

- `handleRefreshStats`:

```ts
const [s, src, runs] = await Promise.all([
  apiRef.current.getStats(),
  apiRef.current.getSources(),
  apiRef.current.getScrapeRuns().catch(() => [] as ScrapeRun[]),
]);
if (mountedRef.current) {
  setStats(s);
  setSources(src);
  setScrapeRuns(runs);
}
```

- `handleSignOut`: añadir `setScrapeRuns(null);`.
- `TAB_LABELS`: insertar `search: "Buscar",` entre `users` y `sources`.
- Render del Dashboard: añadir props `scrapeRateMin={config?.scrapeRateMin}` y `scrapeRuns={scrapeRuns}`.
- Render de Users: añadir prop:

```tsx
              onLoadQa={(chatId) =>
                apiRef.current
                  ? apiRef.current.getQaLogs(chatId)
                  : Promise.reject(new Error("API not initialized"))
              }
```

- Render del tab nuevo (después del bloque de `users`):

```tsx
{
  activeTab === "search" && (
    <Search
      onSearch={(p) =>
        apiRef.current
          ? apiRef.current.searchItems(p)
          : Promise.reject(new Error("API not initialized"))
      }
      sources={sources}
    />
  );
}
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/frontend-admin` (suite frontend completa) → todo verde.
- [ ] Commit: `git add frontend-admin/src && git commit -m "✨ feat(frontend-admin): integra Buscar, Q&A por usuario y scrape-runs en el App"`

---

## Task 15 — Infra: rutas nuevas + snapshot (env + IAM) en `AdminStack`

**Files:**

- Modify: `infra/lib/admin-stack.ts` (props ~línea 30, env del Lambda ~línea 69, grants ~línea 79, rutas ~línea 155)
- Modify: `infra/bin/app.ts` (instanciación de `AdminStack` ~línea 48)
- Modify: `infra/lib/__tests__/admin-stack.test.ts` (`template()` + conteo de rutas + tests nuevos)

**Interfaces:**

- Produces: `AdminStackProps` gana `snapshotBucket: s3.Bucket` y `publicDomain: string`. El `AdminFn` gana env `SNAPSHOT_BUCKET` (HeadObject de B1) y `SNAPSHOT_URL = https://<publicDomain>/snapshot.json` (búsqueda B2, misma URL pública que usa el data-api — el Lambda lee el snapshot por HTTP, no por S3), `grantRead` acotado a `snapshot.json`, y 3 rutas JWT nuevas. Total de rutas: **18**.
- Consumes: `data.snapshotBucket` (DataStack) y `domainName` (context), como ya hacen BotStack/ApiStack — referencia directa sin ciclo (DataStack no depende de AdminStack).

### Steps

- [ ] Actualizar `infra/lib/__tests__/admin-stack.test.ts`. En `template()`:

```ts
const admin = new AdminStack(app, "Admin", {
  table: data.table,
  scraperFn: scraper.scraperFn,
  snapshotBucket: data.snapshotBucket,
  publicDomain: "venezuelahelp.click",
});
```

Cambiar el test de conteo a `"creates exactly 18 routes, all protected with JWT"` con `t.resourceCountIs("AWS::ApiGatewayV2::Route", 18);` y añadir:

```ts
it("registers the observability routes (qa-logs, items/search, scrape-runs)", () => {
  const routes = template().findResources("AWS::ApiGatewayV2::Route");
  const keys = Object.values(routes).map((r) => r.Properties?.RouteKey);
  expect(keys).toContain("GET /qa-logs/{chatId}");
  expect(keys).toContain("GET /items/search");
  expect(keys).toContain("GET /scrape-runs");
});

it("el Lambda admin conoce el bucket y la URL pública del snapshot", () => {
  template().hasResourceProperties("AWS::Lambda::Function", {
    Environment: {
      Variables: {
        TABLE_NAME: Match.anyValue(),
        SNAPSHOT_BUCKET: Match.anyValue(),
        SNAPSHOT_URL: "https://venezuelahelp.click/snapshot.json",
      },
    },
  });
});

it("concede s3:GetObject sobre snapshot.json (HeadObject para /stats)", () => {
  const policies = template().findResources("AWS::IAM::Policy");
  const json = JSON.stringify(policies);
  expect(json).toContain("s3:GetObject");
  expect(json).toContain("snapshot.json");
});
```

- [ ] Correr y ver que falla: `npm test --workspace @venezuelahelp/infra -- lib/__tests__/admin-stack.test.ts` → error de compilación de props (faltan `snapshotBucket`/`publicDomain` en `AdminStackProps`) — ese error de tipos ES el rojo.
- [ ] Implementación en `infra/lib/admin-stack.ts`:

```ts
export interface AdminStackProps extends StackProps {
  table: dynamodb.Table;
  scraperFn: lambda.IFunction;
  // Bucket del snapshot (HeadObject → edad del snapshot en /stats).
  snapshotBucket: s3.Bucket;
  // Dominio público del sitio: la URL del snapshot.json para /items/search
  // se deriva de aquí (el Lambda lee por HTTP igual que el data-api).
  publicDomain: string;
  adminDomain?: string;
  certificate?: acm.ICertificate;
  hostedZone?: route53.IHostedZone;
}
```

En el `environment` del `AdminFn`:

```ts
      environment: {
        TABLE_NAME: props.table.tableName,
        SCRAPER_FN_NAME: props.scraperFn.functionName,
        SNAPSHOT_BUCKET: props.snapshotBucket.bucketName,
        SNAPSHOT_URL: `https://${props.publicDomain}/snapshot.json`,
      },
```

Tras `props.scraperFn.grantInvoke(fn);`:

```ts
// Solo lectura de snapshot.json (HeadObject → LastModified para /stats).
props.snapshotBucket.grantRead(fn, "snapshot.json");
```

Tras la ruta `/tg-users` (antes del bloque «Programa de API»):

```ts
// ── Observabilidad ────────────────────────────────────────────────────────
api.addRoutes({
  path: "/qa-logs/{chatId}",
  methods: [HttpMethod.GET],
  integration,
});
api.addRoutes({
  path: "/items/search",
  methods: [HttpMethod.GET],
  integration,
});
api.addRoutes({
  path: "/scrape-runs",
  methods: [HttpMethod.GET],
  integration,
});
```

En `infra/bin/app.ts`, la instanciación de `AdminStack`:

```ts
new AdminStack(app, "VenezuelaHelpAdminStack", {
  env,
  table: data.table,
  scraperFn: scraper.scraperFn,
  snapshotBucket: data.snapshotBucket,
  publicDomain: domainName,
  adminDomain: `admin.${domainName}`,
  certificate: domain.certificate,
  hostedZone: domain.hostedZone,
});
```

- [ ] Correr test verde: `npm test --workspace @venezuelahelp/infra -- lib/__tests__/admin-stack.test.ts` → todos pasan (incluye el conteo 18).
- [ ] Commit: `git add infra && git commit -m "🏗️ feat(infra): rutas de observabilidad + env e IAM del snapshot para el Lambda admin"`

---

## Task 16 — Verificación final (builds + suite completa)

**Files:** ninguno nuevo (solo verificación; si algo falla, arreglar en el task correspondiente antes de cerrar).

### Steps

- [ ] Build de ambos frontends (el AdminStack exige `frontend-admin/dist` en synth y `tsc -b` typechequea el código nuevo del admin):

```bash
npm run build --workspace @venezuelahelp/frontend-public --workspace @venezuelahelp/frontend-admin
```

→ termina sin errores de TypeScript ni de Vite.

- [ ] Build de backend + infra: `npm run build` → sin errores.
- [ ] Suite completa desde la raíz: `npm test` → **todos los workspaces verdes** (backend incluye scrapeRunRepo/orchestrator/snapshotHead/router/handler; frontend-admin incluye api/QaLogDrawer/Users/Search/Dashboard/App; infra incluye admin-stack con 18 rutas).
- [ ] Revisar `git status`: working tree limpio (todo commiteado, sin hacks de test sueltos — lección del monkey-patch de Intl).
- [ ] Commit final solo si quedó algo fuera: `git add -A && git commit -m "✅ test(admin-observabilidad): verificación final de builds y suite"` (si el tree ya está limpio, omitir).

**Criterio de éxito del plan:** las 3 rutas nuevas responden bajo JWT, `/stats` trae `snapshotUpdatedAt` cuando S3 responde (y sale sin la clave si falla), el scrape sigue funcionando aunque DynamoDB rechace el `put` del historial, y el admin muestra: drawer de Q&A al clickear un usuario, tab «Buscar» con resultados y «Ver original», y Dashboard con edad del snapshot (+aviso amarillo) y últimos scrapes.

---

## Notas de despliegue (post-merge, informativo)

- El merge a `main` despliega todo vía GitHub Actions (`deploy.yml` → `cdk deploy --all`); no hay pasos manuales.
- Stacks afectados: `VenezuelaHelpAdminStack` (rutas + env + IAM + SPA), `VenezuelaHelpScraperStack` (orchestrator). El primer `ScrapeRun` aparece tras la primera corrida post-deploy (≤30 min); hasta entonces «Últimos scrapes» no se muestra (lista vacía).
- `snapshotUpdatedAt` funciona desde el primer `/stats` (el `snapshot.json` ya existe en S3).

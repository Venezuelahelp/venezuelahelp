# VenezuelaHelp — Fase 1: Cimientos (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar el monorepo, la capa de datos compartida (tipos + repositorios DynamoDB single-table) y el `DataStack` de CDK que crea la tabla, buckets, SSM y DLQ.

**Architecture:** Monorepo con npm workspaces (`backend`, `infra`). El backend expone repositorios tipados sobre una única tabla DynamoDB (single-table design) usando AWS SDK v3 DocumentClient. La infra se define con AWS CDK v2; en esta fase solo el `DataStack`. Todo se prueba con vitest: los repos con `aws-sdk-client-mock`, la infra con `aws-cdk-lib/assertions`.

**Tech Stack:** Node.js 20, TypeScript 5 (strict), npm workspaces, vitest, AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`), `aws-sdk-client-mock`, AWS CDK v2 (`aws-cdk-lib`, `constructs`), Zod.

## Global Constraints

- TypeScript strict mode siempre (`"strict": true`).
- Variables de entorno vía `process.env` validadas con **Zod**.
- Sin `console.log` en producción — logging estructurado (se integra AWS Powertools en fases posteriores; en Fase 1 los repos no loguean).
- Imports con alias `@/` apuntando a `backend/src`.
- Conventional Commits con emoji: `<emoji> <tipo>(<scope>): <desc imperativa>`.
- Nunca commitear directo a `main`; trabajar en rama `feat/fase1-cimientos`.
- Región AWS `us-east-1`, perfil `VenezuelaHelp`.
- Nombre de tabla DynamoDB: `VenezuelaHelp`. GSI: ninguno en Fase 1 (la identidad estable de cada ítem da idempotencia; ver Task 6 nota de diseño — refina el spec que mencionaba un GSI de hash).
- Categorías válidas (union cerrada): `reportes | desaparecidos | acopios | edificios | solicitudes`.

---

## File Structure

```
venezuelahelp/
├── package.json                      # root: workspaces + scripts
├── tsconfig.base.json                # config TS compartida
├── .gitignore
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── shared/
│       │   ├── types.ts              # Category, NormalizedItem, StoredItem, Source, Config, QaLogEntry
│       │   ├── keys.ts               # helpers de PK/SK + contentHash
│       │   ├── ddb.ts                # factory DocumentClient + TABLE_NAME
│       │   └── repos/
│       │       ├── configRepo.ts
│       │       ├── sourceRepo.ts
│       │       ├── itemRepo.ts
│       │       └── qaLogRepo.ts
│       └── shared/__tests__/
│           ├── keys.test.ts
│           ├── configRepo.test.ts
│           ├── sourceRepo.test.ts
│           ├── itemRepo.test.ts
│           └── qaLogRepo.test.ts
└── infra/
    ├── package.json
    ├── tsconfig.json
    ├── cdk.json
    ├── vitest.config.ts
    ├── bin/app.ts
    ├── lib/data-stack.ts
    └── lib/__tests__/data-stack.test.ts
```

---

### Task 1: Monorepo scaffold

**Files:**

- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`
- Create: `backend/src/shared/__tests__/smoke.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces: workspace ejecutable con `npm test`; alias `@/` → `backend/src`.

- [ ] **Step 1: Crear la rama**

Run: `git checkout -b feat/fase1-cimientos`

- [ ] **Step 2: Root `package.json` con workspaces**

Create `package.json`:

```json
{
  "name": "venezuelahelp",
  "private": true,
  "workspaces": ["backend", "infra"],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present"
  }
}
```

- [ ] **Step 3: `tsconfig.base.json` compartido**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: `.gitignore`**

Create `.gitignore`:

```
node_modules/
dist/
cdk.out/
*.tsbuildinfo
.env
```

- [ ] **Step 5: `backend/package.json`**

Create `backend/package.json`:

```json
{
  "name": "@venezuelahelp/backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.600.0",
    "@aws-sdk/lib-dynamodb": "^3.600.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "aws-sdk-client-mock": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 6: `backend/tsconfig.json` con alias**

Create `backend/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "baseUrl": "src",
    "paths": { "@/*": ["*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 7: `backend/vitest.config.ts` con alias**

Create `backend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: { globals: true, environment: "node" },
});
```

- [ ] **Step 8: Smoke test**

Create `backend/src/shared/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Instalar y correr**

Run: `npm install && npm test`
Expected: instala dependencias y el smoke test pasa (1 passed).

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.base.json .gitignore backend/
git commit -m "🏗️ chore(backend): scaffold monorepo with npm workspaces and vitest"
```

---

### Task 2: Tipos compartidos

**Files:**

- Create: `backend/src/shared/types.ts`

**Interfaces:**

- Produces:
  - `type Category = "reportes" | "desaparecidos" | "acopios" | "edificios" | "solicitudes"`
  - `interface GeoPoint { lat: number; lng: number; nombre?: string }`
  - `interface NormalizedItem { category: Category; sourceId: string; externalId: string; titulo: string; texto: string; ubicacion?: GeoPoint; status?: string; raw: unknown }`
  - `interface StoredItem extends NormalizedItem { contentHash: string; firstSeenAt: string; lastSeenAt: string }`
  - `interface Source { id: string; nombre: string; url: string; connector: "jsonApi" | "headless"; endpoint?: string; enabled: boolean; lastRun?: string; lastStatus?: "ok" | "error"; errorMsg?: string }`
  - `interface Config { scrapeRateMin: number; bedrockModelId: string; systemPrompt: string; botTriggerMode: "mention" | "command" | "all" }`
  - `interface QaLogEntry { chatId: string; ts: string; pregunta: string; respuesta: string; itemsUsados: string[]; tokensIn: number; tokensOut: number; modelo: string; costoEstimado: number; flagged: boolean }`

- [ ] **Step 1: Escribir `types.ts`**

Create `backend/src/shared/types.ts`:

```ts
export const CATEGORIES = [
  "reportes",
  "desaparecidos",
  "acopios",
  "edificios",
  "solicitudes",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface GeoPoint {
  lat: number;
  lng: number;
  nombre?: string;
}

export interface NormalizedItem {
  category: Category;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: GeoPoint;
  status?: string;
  raw: unknown;
}

export interface StoredItem extends NormalizedItem {
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Source {
  id: string;
  nombre: string;
  url: string;
  connector: "jsonApi" | "headless";
  endpoint?: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: "ok" | "error";
  errorMsg?: string;
}

export interface Config {
  scrapeRateMin: number;
  bedrockModelId: string;
  systemPrompt: string;
  botTriggerMode: "mention" | "command" | "all";
}

export interface QaLogEntry {
  chatId: string;
  ts: string;
  pregunta: string;
  respuesta: string;
  itemsUsados: string[];
  tokensIn: number;
  tokensOut: number;
  modelo: string;
  costoEstimado: number;
  flagged: boolean;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build --workspace @venezuelahelp/backend`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/types.ts
git commit -m "✨ feat(backend): add shared domain types"
```

---

### Task 3: Helpers de claves y contentHash

**Files:**

- Create: `backend/src/shared/keys.ts`
- Test: `backend/src/shared/__tests__/keys.test.ts`

**Interfaces:**

- Consumes: `Category`, `NormalizedItem` de `@/shared/types`.
- Produces:
  - `itemKey(category, sourceId, externalId): { PK: string; SK: string }`
  - `contentHash(item: NormalizedItem): string` — sha256 hex estable de `{titulo, texto, ubicacion, status}`.
  - Constantes: `SOURCE_PK(id)`, `CONFIG_KEY`, `QA_PK(chatId)`.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/shared/__tests__/keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { itemKey, contentHash } from "@/shared/keys";
import type { NormalizedItem } from "@/shared/types";

const base: NormalizedItem = {
  category: "reportes",
  sourceId: "sismo",
  externalId: "42",
  titulo: "Edificio colapsado",
  texto: "Calle 5",
  raw: { a: 1 },
};

describe("itemKey", () => {
  it("builds stable PK/SK from category and ids", () => {
    expect(itemKey("reportes", "sismo", "42")).toEqual({
      PK: "CAT#reportes",
      SK: "sismo#42",
    });
  });
});

describe("contentHash", () => {
  it("is stable for same meaningful content", () => {
    expect(contentHash(base)).toBe(contentHash({ ...base, raw: { b: 2 } }));
  });

  it("changes when meaningful content changes", () => {
    expect(contentHash(base)).not.toBe(
      contentHash({ ...base, texto: "Calle 6" }),
    );
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- keys`
Expected: FAIL — `Cannot find module '@/shared/keys'`.

- [ ] **Step 3: Implementar `keys.ts`**

Create `backend/src/shared/keys.ts`:

```ts
import { createHash } from "node:crypto";
import type { Category, NormalizedItem } from "@/shared/types";

export const CONFIG_KEY = { PK: "CONFIG", SK: "GLOBAL" } as const;

export function SOURCE_PK(id: string) {
  return `SOURCE#${id}`;
}

export function QA_PK(chatId: string) {
  return `QA#${chatId}`;
}

export function itemKey(
  category: Category,
  sourceId: string,
  externalId: string,
) {
  return { PK: `CAT#${category}`, SK: `${sourceId}#${externalId}` };
}

export function contentHash(item: NormalizedItem): string {
  const meaningful = {
    titulo: item.titulo,
    texto: item.texto,
    ubicacion: item.ubicacion ?? null,
    status: item.status ?? null,
  };
  return createHash("sha256").update(JSON.stringify(meaningful)).digest("hex");
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- keys`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/keys.ts backend/src/shared/__tests__/keys.test.ts
git commit -m "✨ feat(backend): add single-table key helpers and content hashing"
```

---

### Task 4: Cliente DynamoDB + ConfigRepo

**Files:**

- Create: `backend/src/shared/ddb.ts`
- Create: `backend/src/shared/repos/configRepo.ts`
- Test: `backend/src/shared/__tests__/configRepo.test.ts`

**Interfaces:**

- Consumes: `Config` de `@/shared/types`, `CONFIG_KEY` de `@/shared/keys`.
- Produces:
  - `ddb`: instancia `DynamoDBDocumentClient` exportada de `@/shared/ddb`.
  - `TABLE_NAME: string` (lee `process.env.TABLE_NAME`, default `"VenezuelaHelp"`).
  - `class ConfigRepo { get(): Promise<Config>; put(config: Config): Promise<void> }` — `get()` devuelve defaults si no existe.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/shared/__tests__/configRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConfigRepo } from "@/shared/repos/configRepo";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

describe("ConfigRepo", () => {
  it("returns defaults when no config stored", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    const cfg = await new ConfigRepo().get();
    expect(cfg.scrapeRateMin).toBe(30);
    expect(cfg.botTriggerMode).toBe("mention");
  });

  it("returns stored config when present", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "CONFIG",
        SK: "GLOBAL",
        scrapeRateMin: 15,
        bedrockModelId: "x",
        systemPrompt: "p",
        botTriggerMode: "all",
      },
    });
    const cfg = await new ConfigRepo().get();
    expect(cfg.scrapeRateMin).toBe(15);
    expect(cfg.botTriggerMode).toBe("all");
  });

  it("writes config with the CONFIG#GLOBAL key", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new ConfigRepo().put({
      scrapeRateMin: 20,
      bedrockModelId: "m",
      systemPrompt: "s",
      botTriggerMode: "command",
    });
    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input.Item).toMatchObject({
      PK: "CONFIG",
      SK: "GLOBAL",
      scrapeRateMin: 20,
    });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- configRepo`
Expected: FAIL — módulos `@/shared/ddb` / `@/shared/repos/configRepo` no existen.

- [ ] **Step 3: Implementar `ddb.ts`**

Create `backend/src/shared/ddb.ts`:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.TABLE_NAME ?? "VenezuelaHelp";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
```

- [ ] **Step 4: Implementar `configRepo.ts`**

Create `backend/src/shared/repos/configRepo.ts`:

```ts
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { CONFIG_KEY } from "@/shared/keys";
import type { Config } from "@/shared/types";

const DEFAULT_CONFIG: Config = {
  scrapeRateMin: 30,
  bedrockModelId: "amazon.nova-lite-v1:0",
  systemPrompt:
    "Eres un asistente sobre el terremoto de Venezuela. Responde en español, solo con la información provista, cita la fuente y di 'No tengo ese dato' si no hay información relevante.",
  botTriggerMode: "mention",
};

export class ConfigRepo {
  async get(): Promise<Config> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: CONFIG_KEY }),
    );
    if (!res.Item) return DEFAULT_CONFIG;
    return {
      scrapeRateMin: res.Item.scrapeRateMin,
      bedrockModelId: res.Item.bedrockModelId,
      systemPrompt: res.Item.systemPrompt,
      botTriggerMode: res.Item.botTriggerMode,
    };
  }

  async put(config: Config): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...CONFIG_KEY, ...config },
      }),
    );
  }
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- configRepo`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/ddb.ts backend/src/shared/repos/configRepo.ts backend/src/shared/__tests__/configRepo.test.ts
git commit -m "✨ feat(backend): add DynamoDB client and ConfigRepo with defaults"
```

---

### Task 5: SourceRepo

**Files:**

- Create: `backend/src/shared/repos/sourceRepo.ts`
- Test: `backend/src/shared/__tests__/sourceRepo.test.ts`

**Interfaces:**

- Consumes: `Source` de `@/shared/types`, `SOURCE_PK` de `@/shared/keys`, `ddb`/`TABLE_NAME`.
- Produces:
  - `class SourceRepo { put(s: Source): Promise<void>; get(id: string): Promise<Source | null>; list(): Promise<Source[]>; listEnabled(): Promise<Source[]> }`
  - Almacenamiento: `PK=SOURCE#<id>`, `SK=META`.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/shared/__tests__/sourceRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { SourceRepo } from "@/shared/repos/sourceRepo";
import type { Source } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const src: Source = {
  id: "sismo",
  nombre: "SismoVenezuela",
  url: "https://www.sismovenezuela.com/",
  connector: "jsonApi",
  enabled: true,
};

describe("SourceRepo", () => {
  it("stores a source under SOURCE#id / META", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new SourceRepo().put(src);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "SOURCE#sismo",
      SK: "META",
      id: "sismo",
      enabled: true,
    });
  });

  it("listEnabled filters out disabled sources", async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          PK: "SOURCE#a",
          SK: "META",
          id: "a",
          enabled: true,
          nombre: "A",
          url: "u",
          connector: "jsonApi",
        },
        {
          PK: "SOURCE#b",
          SK: "META",
          id: "b",
          enabled: false,
          nombre: "B",
          url: "u",
          connector: "jsonApi",
        },
      ],
    });
    const enabled = await new SourceRepo().listEnabled();
    expect(enabled.map((s) => s.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- sourceRepo`
Expected: FAIL — `@/shared/repos/sourceRepo` no existe.

- [ ] **Step 3: Implementar `sourceRepo.ts`**

Create `backend/src/shared/repos/sourceRepo.ts`:

```ts
import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { SOURCE_PK } from "@/shared/keys";
import type { Source } from "@/shared/types";

const SK = "META";

function toSource(item: Record<string, unknown>): Source {
  const { PK, SK: _sk, ...rest } = item;
  return rest as unknown as Source;
}

export class SourceRepo {
  async put(s: Source): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: SOURCE_PK(s.id), SK, ...s },
      }),
    );
  }

  async get(id: string): Promise<Source | null> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { PK: SOURCE_PK(id), SK } }),
    );
    return res.Item ? toSource(res.Item) : null;
  }

  async list(): Promise<Source[]> {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "SK = :sk",
        ExpressionAttributeValues: { ":sk": SK },
      }),
    );
    return (res.Items ?? []).map(toSource);
  }

  async listEnabled(): Promise<Source[]> {
    return (await this.list()).filter((s) => s.enabled);
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- sourceRepo`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/repos/sourceRepo.ts backend/src/shared/__tests__/sourceRepo.test.ts
git commit -m "✨ feat(backend): add SourceRepo with enabled filtering"
```

---

### Task 6: ItemRepo (upsert idempotente + query por categoría)

**Nota de diseño:** la identidad estable `CAT#<categoria> / <sourceId>#<externalId>` garantiza idempotencia sin GSI: re-scrapear el mismo ítem **actualiza en sitio**. `contentHash` distingue si el contenido cambió (`updated` vs `unchanged`). Esto refina el spec (que mencionaba un GSI de hash) por algo más simple con la misma garantía.

**Files:**

- Create: `backend/src/shared/repos/itemRepo.ts`
- Test: `backend/src/shared/__tests__/itemRepo.test.ts`

**Interfaces:**

- Consumes: `NormalizedItem`, `StoredItem`, `Category` de `@/shared/types`; `itemKey`, `contentHash` de `@/shared/keys`; `ddb`/`TABLE_NAME`.
- Produces:
  - `class ItemRepo {`
    - `upsert(item: NormalizedItem, now: string): Promise<"created" | "updated" | "unchanged">`
    - `listByCategory(category: Category): Promise<StoredItem[]>` (orden por `lastSeenAt` desc)
  - `}`

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/shared/__tests__/itemRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ItemRepo } from "@/shared/repos/itemRepo";
import type { NormalizedItem } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const item: NormalizedItem = {
  category: "reportes",
  sourceId: "sismo",
  externalId: "1",
  titulo: "t",
  texto: "x",
  raw: {},
};

describe("ItemRepo.upsert", () => {
  it("returns 'created' when item did not exist", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    ddbMock.on(PutCommand).resolves({});
    const res = await new ItemRepo().upsert(item, "2026-06-25T00:00:00Z");
    expect(res).toBe("created");
    const stored = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(stored).toMatchObject({
      PK: "CAT#reportes",
      SK: "sismo#1",
      firstSeenAt: "2026-06-25T00:00:00Z",
    });
  });

  it("returns 'unchanged' and skips write when hash matches", async () => {
    const { contentHash } = await import("@/shared/keys");
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "CAT#reportes",
        SK: "sismo#1",
        contentHash: contentHash(item),
        firstSeenAt: "old",
      },
    });
    const res = await new ItemRepo().upsert(item, "2026-06-25T01:00:00Z");
    expect(res).toBe("unchanged");
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("returns 'updated' and preserves firstSeenAt when content changed", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "CAT#reportes",
        SK: "sismo#1",
        contentHash: "different",
        firstSeenAt: "2026-06-01T00:00:00Z",
      },
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await new ItemRepo().upsert(item, "2026-06-25T02:00:00Z");
    expect(res).toBe("updated");
    const stored = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(stored).toMatchObject({
      firstSeenAt: "2026-06-01T00:00:00Z",
      lastSeenAt: "2026-06-25T02:00:00Z",
    });
  });
});

describe("ItemRepo.listByCategory", () => {
  it("queries the category partition and sorts by lastSeenAt desc", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: "CAT#reportes",
          SK: "sismo#1",
          lastSeenAt: "2026-06-25T00:00:00Z",
          titulo: "a",
        },
        {
          PK: "CAT#reportes",
          SK: "sismo#2",
          lastSeenAt: "2026-06-26T00:00:00Z",
          titulo: "b",
        },
      ],
    });
    const items = await new ItemRepo().listByCategory("reportes");
    expect(items.map((i) => i.titulo)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- itemRepo`
Expected: FAIL — `@/shared/repos/itemRepo` no existe.

- [ ] **Step 3: Implementar `itemRepo.ts`**

Create `backend/src/shared/repos/itemRepo.ts`:

```ts
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { itemKey, contentHash } from "@/shared/keys";
import type { Category, NormalizedItem, StoredItem } from "@/shared/types";

export class ItemRepo {
  async upsert(
    item: NormalizedItem,
    now: string,
  ): Promise<"created" | "updated" | "unchanged"> {
    const key = itemKey(item.category, item.sourceId, item.externalId);
    const hash = contentHash(item);

    const existing = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: key }),
    );

    if (existing.Item && existing.Item.contentHash === hash) {
      return "unchanged";
    }

    const firstSeenAt =
      (existing.Item?.firstSeenAt as string | undefined) ?? now;
    const stored: StoredItem & { PK: string; SK: string } = {
      ...key,
      ...item,
      contentHash: hash,
      firstSeenAt,
      lastSeenAt: now,
    };

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: stored }));
    return existing.Item ? "updated" : "created";
  }

  async listByCategory(category: Category): Promise<StoredItem[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `CAT#${category}` },
      }),
    );
    const items = (res.Items ?? []) as unknown as StoredItem[];
    return items.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- itemRepo`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/repos/itemRepo.ts backend/src/shared/__tests__/itemRepo.test.ts
git commit -m "✨ feat(backend): add ItemRepo with idempotent upsert and category query"
```

---

### Task 7: QaLogRepo

**Files:**

- Create: `backend/src/shared/repos/qaLogRepo.ts`
- Test: `backend/src/shared/__tests__/qaLogRepo.test.ts`

**Interfaces:**

- Consumes: `QaLogEntry` de `@/shared/types`, `QA_PK` de `@/shared/keys`, `ddb`/`TABLE_NAME`.
- Produces:
  - `class QaLogRepo { append(e: QaLogEntry): Promise<void>; listByChat(chatId: string, limit?: number): Promise<QaLogEntry[]> }`
  - Almacenamiento: `PK=QA#<chatId>`, `SK=<ts>`.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/shared/__tests__/qaLogRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import type { QaLogEntry } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

const entry: QaLogEntry = {
  chatId: "123",
  ts: "2026-06-25T00:00:00Z",
  pregunta: "?",
  respuesta: "!",
  itemsUsados: ["CAT#reportes/sismo#1"],
  tokensIn: 10,
  tokensOut: 5,
  modelo: "amazon.nova-lite-v1:0",
  costoEstimado: 0.0001,
  flagged: false,
};

describe("QaLogRepo", () => {
  it("appends under QA#chatId / ts", async () => {
    ddbMock.on(PutCommand).resolves({});
    await new QaLogRepo().append(entry);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      PK: "QA#123",
      SK: "2026-06-25T00:00:00Z",
      pregunta: "?",
    });
  });

  it("listByChat queries newest first with a limit", async () => {
    ddbMock
      .on(QueryCommand)
      .resolves({ Items: [{ ...entry, PK: "QA#123", SK: entry.ts }] });
    const items = await new QaLogRepo().listByChat("123", 50);
    const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(input.ScanIndexForward).toBe(false);
    expect(input.Limit).toBe(50);
    expect(items[0].pregunta).toBe("?");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test --workspace @venezuelahelp/backend -- qaLogRepo`
Expected: FAIL — `@/shared/repos/qaLogRepo` no existe.

- [ ] **Step 3: Implementar `qaLogRepo.ts`**

Create `backend/src/shared/repos/qaLogRepo.ts`:

```ts
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { QA_PK } from "@/shared/keys";
import type { QaLogEntry } from "@/shared/types";

function toEntry(item: Record<string, unknown>): QaLogEntry {
  const { PK, SK, ...rest } = item;
  return rest as unknown as QaLogEntry;
}

export class QaLogRepo {
  async append(e: QaLogEntry): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { PK: QA_PK(e.chatId), SK: e.ts, ...e },
      }),
    );
  }

  async listByChat(chatId: string, limit = 50): Promise<QaLogEntry[]> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": QA_PK(chatId) },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map(toEntry);
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test --workspace @venezuelahelp/backend -- qaLogRepo`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/repos/qaLogRepo.ts backend/src/shared/__tests__/qaLogRepo.test.ts
git commit -m "✨ feat(backend): add QaLogRepo for question/answer logging"
```

---

### Task 8: CDK app + DataStack

**Files:**

- Create: `infra/package.json`, `infra/tsconfig.json`, `infra/cdk.json`, `infra/vitest.config.ts`
- Create: `infra/bin/app.ts`
- Create: `infra/lib/data-stack.ts`
- Test: `infra/lib/__tests__/data-stack.test.ts`

**Interfaces:**

- Consumes: nada del backend (infra es independiente).
- Produces:
  - `class DataStack extends Stack` que crea: tabla DynamoDB `VenezuelaHelp` (PK/SK string, PAY_PER_REQUEST), bucket público de snapshot, parámetros SSM (`/venezuelahelp/telegram-token` placeholder SecureString se crea en Fase 3; aquí solo `/venezuelahelp/table-name`), y una DLQ SQS `venezuelahelp-scraper-dlq`.

- [ ] **Step 1: `infra/package.json`**

Create `infra/package.json`:

```json
{
  "name": "@venezuelahelp/infra",
  "version": "0.1.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "cdk": "cdk"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.140.0",
    "constructs": "^10.3.0"
  },
  "devDependencies": {
    "aws-cdk": "^2.140.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: `infra/tsconfig.json`**

Create `infra/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["bin", "lib"]
}
```

- [ ] **Step 3: `infra/cdk.json`**

Create `infra/cdk.json`:

```json
{
  "app": "npx tsx bin/app.ts"
}
```

Nota: añade `tsx` a devDependencies si no usas ts-node. Para los tests no se necesita; el `cdk deploy` real se cubre al final de la fase.

- [ ] **Step 4: `infra/vitest.config.ts`**

Create `infra/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node" } });
```

- [ ] **Step 5: Escribir el test que falla**

Create `infra/lib/__tests__/data-stack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";

function template() {
  const app = new App();
  const stack = new DataStack(app, "TestDataStack");
  return Template.fromStack(stack);
}

describe("DataStack", () => {
  it("creates a pay-per-request DynamoDB table named VenezuelaHelp", () => {
    template().hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "VenezuelaHelp",
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("creates a snapshot S3 bucket and a scraper DLQ", () => {
    const t = template();
    t.resourceCountIs("AWS::S3::Bucket", 1);
    t.hasResourceProperties("AWS::SQS::Queue", {
      QueueName: "venezuelahelp-scraper-dlq",
    });
  });
});
```

- [ ] **Step 6: Correr el test para verificar que falla**

Run: `npm test --workspace @venezuelahelp/infra`
Expected: FAIL — `../data-stack` no existe.

- [ ] **Step 7: Implementar `data-stack.ts`**

Create `infra/lib/data-stack.ts`:

```ts
import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class DataStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly snapshotBucket: s3.Bucket;
  public readonly scraperDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, "Table", {
      tableName: "VenezuelaHelp",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.snapshotBucket = new s3.Bucket(this, "SnapshotBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.scraperDlq = new sqs.Queue(this, "ScraperDlq", {
      queueName: "venezuelahelp-scraper-dlq",
    });

    new ssm.StringParameter(this, "TableNameParam", {
      parameterName: "/venezuelahelp/table-name",
      stringValue: this.table.tableName,
    });
  }
}
```

- [ ] **Step 8: Implementar `bin/app.ts`**

Create `infra/bin/app.ts`:

```ts
import { App } from "aws-cdk-lib";
import { DataStack } from "../lib/data-stack";

const app = new App();
new DataStack(app, "VenezuelaHelpDataStack", {
  env: { region: "us-east-1" },
});
```

- [ ] **Step 9: Correr el test para verificar que pasa**

Run: `npm test --workspace @venezuelahelp/infra`
Expected: PASS (2 passed).

- [ ] **Step 10: Commit**

```bash
git add infra/
git commit -m "🏗️ feat(infra): add CDK app and DataStack (table, snapshot bucket, DLQ, SSM)"
```

---

### Task 9: Verificación final de la fase

- [ ] **Step 1: Correr toda la suite**

Run: `npm test`
Expected: pasan todos los tests de `backend` e `infra`.

- [ ] **Step 2: Build completo**

Run: `npm run build`
Expected: compila backend e infra sin errores.

- [ ] **Step 3 (opcional, requiere AWS): synth del CDK**

Run: `cd infra && npx cdk synth --profile VenezuelaHelp`
Expected: genera la plantilla CloudFormation sin errores. (No hace deploy.)

- [ ] **Step 4: Commit final si quedó algo pendiente**

```bash
git add -A && git commit -m "✅ test(fase1): green full suite for foundation" || echo "nada que commitear"
```

---

## Self-Review

**Cobertura del spec (Fase 1):**

- §4 estructura de carpetas → Task 1 (backend + infra; frontends llegan en Fases 4–5). ✓
- §5 modelo de datos single-table → Tasks 2–7 (tipos + 4 repos). ✓ (la decisión de no usar GSI se documenta en Task 6.)
- §10 IaC `DataStack` → Task 8. ✓
- §12 pruebas unitarias de repos → cada repo trae su test. ✓
- §13 convenciones (strict, alias `@/`, Conventional Commits) → Tasks 1, 6, todos los commits. ✓

**Placeholders:** sin TBD/TODO; todo el código está completo. ✓

**Consistencia de tipos:** `NormalizedItem`/`StoredItem`/`Category` definidos en Task 2 y consumidos con las mismas firmas en Tasks 3–7; `itemKey`/`contentHash` definidos en Task 3 y usados en Task 6. ✓

**Fuera de alcance de Fase 1 (van en sus fases):** conectores y scraper (Fase 2), Lambdas/API Gateway/EventBridge/Bedrock (Fases 2–3), Cognito y CloudFront (Fases 4–5). El `DataStack` se deja listo para que esas fases lo importen.

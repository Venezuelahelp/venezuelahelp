# VenezuelaHelp — Fase 3: Bot de Telegram (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bot de Telegram que, cuando lo mencionan o le mandan `/pregunta`, recupera por palabra clave la info del terremoto (del `snapshot.json` ya generado por el scraper), arma un prompt y responde con un modelo barato de Bedrock (Nova Lite), citando la fuente y diciendo "No tengo ese dato" cuando no hay info; registra cada Q&A.

**Architecture:** API Gateway HTTP API → Lambda `telegram` (webhook). El handler: parsea el update → decide si responde (mención / reply / comando) → recupera top-K ítems por palabra clave sobre el `snapshot.json` (leído de S3, cacheado en memoria del Lambda) → arma prompt → Bedrock Converse (Nova Lite, configurable) → responde por la API de Telegram → loguea en DynamoDB. Reutiliza `ConfigRepo` y `QaLogRepo` de Fase 1. Token de Telegram en SSM SecureString.

**Tech Stack:** Node 20 `fetch`, `@aws-sdk/client-bedrock-runtime` (Converse), `@aws-sdk/client-s3`, `@aws-sdk/client-ssm`, vitest + `aws-sdk-client-mock`, CDK `NodejsFunction` + `HttpApi`.

## Global Constraints

- TypeScript strict; alias `@/` → `backend/src`.
- Sin `console.log`: usar `@/shared/logger` (Powertools).
- El webhook **siempre devuelve HTTP 200** a Telegram (evita reintentos en cascada), incluso ante error interno.
- Manejo de errores explícito; nada de swallow silencioso (loguear).
- Conventional Commits con emoji; rama `feat/fase3-telegram` (ya creada).
- **Modelo Bedrock:** default `amazon.nova-lite-v1:0` vía Converse API; el id se lee de `CONFIG#GLOBAL.bedrockModelId` (Fase 1). Si Bedrock lanza `ThrottlingException`/error, el bot responde un mensaje de fallback amable y NO crashea.
- **Disparo en grupo** (de `CONFIG#GLOBAL.botTriggerMode`, default `mention`): responde solo si (a) lo @mencionan, (b) el mensaje es reply a un mensaje del bot, o (c) comando `/pregunta <texto>` (alias `/p`). En modo `all` responde a todo mensaje con texto.
- Token de Telegram: SSM SecureString `/venezuelahelp/telegram-token` (ya creado).
- Retrieval: sobre `snapshot.json` (key `snapshot.json` en `SNAPSHOT_BUCKET`), NO scanea DynamoDB.
- Idioma de respuesta: español.
- Reutilizar Fase 1: `@/shared/repos/configRepo` (`ConfigRepo`), `@/shared/repos/qaLogRepo` (`QaLogRepo`), `@/shared/types`, `@/shared/logger`. NO modificar su comportamiento.

## File Structure

```
backend/src/telegram/
├── types.ts            # tipos mínimos del update de Telegram + PublicItem/Snapshot
├── trigger.ts          # shouldRespond(update, botUsername, mode) + extractQuestion
├── snapshot.ts         # loadSnapshot(): lee snapshot.json de S3 (cache en memoria)
├── retrieval.ts        # retrieve(question, snapshot, k): top-K por palabra clave
├── prompt.ts           # buildMessages(question, items, systemPrompt)
├── bedrock.ts          # askBedrock(modelId, system, userText): {text, tokensIn, tokensOut}
├── telegramApi.ts      # sendMessage(token, chatId, text), getMe(token)
├── secret.ts           # getTelegramToken(): lee SSM (cache)
├── handler.ts          # webhook: orquesta todo, siempre 200
└── __tests__/...

infra/lib/bot-stack.ts  # HttpApi + Lambda telegram + grants + outputs (webhook URL)
infra/bin/app.ts        # (modificar: instanciar BotStack)
```

---

### Task 1: Tipos + lógica de disparo (`trigger.ts`)

**Files:**

- Create: `backend/src/telegram/types.ts`
- Create: `backend/src/telegram/trigger.ts`
- Test: `backend/src/telegram/__tests__/trigger.test.ts`

**Interfaces:**

- Produces en `types.ts`:
  - `interface TgUser { id: number; is_bot?: boolean; username?: string }`
  - `interface TgMessage { message_id: number; text?: string; chat: { id: number; type: string }; from?: TgUser; reply_to_message?: { from?: TgUser }; entities?: Array<{ type: string; offset: number; length: number }> }`
  - `interface TgUpdate { message?: TgMessage }`
  - `type TriggerMode = "mention" | "command" | "all"`
- Produces en `trigger.ts`:
  - `shouldRespond(msg: TgMessage, botUsername: string, mode: TriggerMode): boolean`
  - `extractQuestion(msg: TgMessage, botUsername: string): string` — quita el `@botUsername` y el prefijo de comando `/pregunta`/`/p`, devuelve el texto limpio.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/telegram/__tests__/trigger.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRespond, extractQuestion } from "@/telegram/trigger";
import type { TgMessage } from "@/telegram/types";

const base = (text: string, extra: Partial<TgMessage> = {}): TgMessage => ({
  message_id: 1,
  text,
  chat: { id: 10, type: "group" },
  from: { id: 2, username: "ana" },
  ...extra,
});

describe("shouldRespond", () => {
  it("mention mode: responds when bot is @mentioned", () => {
    const msg = base("hola @vh_bot dónde hay acopios", {
      entities: [{ type: "mention", offset: 5, length: 7 }],
    });
    expect(shouldRespond(msg, "vh_bot", "mention")).toBe(true);
  });
  it("mention mode: responds to a reply to the bot", () => {
    const msg = base("y desaparecidos?", {
      reply_to_message: { from: { id: 9, is_bot: true, username: "vh_bot" } },
    });
    expect(shouldRespond(msg, "vh_bot", "mention")).toBe(true);
  });
  it("mention mode: ignores a normal group message", () => {
    expect(shouldRespond(base("hola a todos"), "vh_bot", "mention")).toBe(
      false,
    );
  });
  it("command mode: responds to /pregunta and /p", () => {
    expect(
      shouldRespond(base("/pregunta dónde hay agua"), "vh_bot", "command"),
    ).toBe(true);
    expect(shouldRespond(base("/p dónde hay agua"), "vh_bot", "command")).toBe(
      true,
    );
    expect(shouldRespond(base("hola"), "vh_bot", "command")).toBe(false);
  });
  it("all mode: responds to any non-empty text", () => {
    expect(shouldRespond(base("cualquier cosa"), "vh_bot", "all")).toBe(true);
    expect(shouldRespond(base(""), "vh_bot", "all")).toBe(false);
  });
});

describe("extractQuestion", () => {
  it("strips the @mention", () => {
    expect(extractQuestion(base("@vh_bot dónde hay acopios"), "vh_bot")).toBe(
      "dónde hay acopios",
    );
  });
  it("strips the /pregunta and /p command", () => {
    expect(extractQuestion(base("/pregunta dónde hay agua"), "vh_bot")).toBe(
      "dónde hay agua",
    );
    expect(extractQuestion(base("/p@vh_bot dónde hay agua"), "vh_bot")).toBe(
      "dónde hay agua",
    );
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — Run: `npm test --workspace @venezuelahelp/backend -- trigger` → FAIL.

- [ ] **Step 3: Implementar `types.ts`**

Create `backend/src/telegram/types.ts`:

```ts
export interface TgUser {
  id: number;
  is_bot?: boolean;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: TgUser;
  reply_to_message?: { from?: TgUser };
  entities?: Array<{ type: string; offset: number; length: number }>;
}

export interface TgUpdate {
  message?: TgMessage;
}

export type TriggerMode = "mention" | "command" | "all";

export interface PublicItem {
  category: string;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: { lat: number; lng: number; nombre?: string };
  status?: string;
}

export interface Snapshot {
  generatedAt: string;
  categories: Record<string, PublicItem[]>;
}
```

- [ ] **Step 4: Implementar `trigger.ts`**

Create `backend/src/telegram/trigger.ts`:

```ts
import type { TgMessage, TriggerMode } from "@/telegram/types";

const CMD = /^\/(pregunta|p)(@\w+)?\b/i;

function isMentioned(msg: TgMessage, botUsername: string): boolean {
  return (msg.text ?? "")
    .toLowerCase()
    .includes(`@${botUsername.toLowerCase()}`);
}

function isReplyToBot(msg: TgMessage, botUsername: string): boolean {
  const u = msg.reply_to_message?.from;
  return (
    !!u &&
    (u.is_bot === true ||
      u.username?.toLowerCase() === botUsername.toLowerCase())
  );
}

export function shouldRespond(
  msg: TgMessage,
  botUsername: string,
  mode: TriggerMode,
): boolean {
  const text = (msg.text ?? "").trim();
  if (!text) return false;
  if (mode === "all") return true;
  if (CMD.test(text)) return true;
  if (mode === "mention")
    return isMentioned(msg, botUsername) || isReplyToBot(msg, botUsername);
  return false;
}

export function extractQuestion(msg: TgMessage, botUsername: string): string {
  let t = (msg.text ?? "").trim();
  t = t.replace(CMD, "").trim();
  t = t.replace(new RegExp(`@${botUsername}`, "ig"), "").trim();
  return t.replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 5: Correr y ver pasar** — Run: `npm test --workspace @venezuelahelp/backend -- trigger` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/telegram/types.ts backend/src/telegram/trigger.ts backend/src/telegram/__tests__/trigger.test.ts
git commit -m "✨ feat(telegram): add update types and trigger logic"
```

---

### Task 2: Loader del snapshot (`snapshot.ts`)

**Files:**

- Create: `backend/src/telegram/snapshot.ts`
- Test: `backend/src/telegram/__tests__/snapshot.test.ts`
- Modify: `backend/package.json` (añadir `@aws-sdk/client-s3` ya está de Fase 2)

**Interfaces:**

- Consumes: `Snapshot` (`@/telegram/types`), `@aws-sdk/client-s3`.
- Produces: `loadSnapshot(deps?): Promise<Snapshot>` — `GetObject` de `SNAPSHOT_BUCKET`/`snapshot.json`, parsea JSON. Cachea en módulo por `SNAPSHOT_TTL_MS` (60s). `deps.s3` inyectable; `deps.now` (number) inyectable para el cache.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/telegram/__tests__/snapshot.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { loadSnapshot, __resetSnapshotCache } from "@/telegram/snapshot";

const s3Mock = mockClient(S3Client);

function bodyOf(obj: unknown) {
  return { transformToString: async () => JSON.stringify(obj) };
}

beforeEach(() => {
  s3Mock.reset();
  __resetSnapshotCache();
  process.env.SNAPSHOT_BUCKET = "b";
});

describe("loadSnapshot", () => {
  it("fetches and parses the snapshot", async () => {
    const snap = { generatedAt: "t", categories: { reportes: [] } };
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyOf(snap) as any });
    const r = await loadSnapshot();
    expect(r.generatedAt).toBe("t");
    expect(r.categories.reportes).toEqual([]);
  });

  it("caches within TTL (only one S3 call)", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: bodyOf({ generatedAt: "t", categories: {} }) as any });
    await loadSnapshot({ now: 1000 });
    await loadSnapshot({ now: 2000 });
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — Run: `npm test --workspace @venezuelahelp/backend -- snapshot.test` → FAIL.
      Nota: hay dos `snapshot.test` (Fase 2 `public-snapshot`). Usa el filtro `telegram/__tests__/snapshot` si hace falta: `npm test --workspace @venezuelahelp/backend -- telegram/__tests__/snapshot`.

- [ ] **Step 3: Implementar `snapshot.ts`**

Create `backend/src/telegram/snapshot.ts`:

```ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Snapshot } from "@/telegram/types";

const KEY = "snapshot.json";
const SNAPSHOT_TTL_MS = 60_000;
const s3 = new S3Client({});

let cache: { at: number; data: Snapshot } | null = null;

export function __resetSnapshotCache() {
  cache = null;
}

interface Deps {
  s3: Pick<S3Client, "send">;
  now: number;
}

export async function loadSnapshot(deps?: Partial<Deps>): Promise<Snapshot> {
  const client = (deps?.s3 as Deps["s3"]) ?? s3;
  const now = deps?.now ?? Date.now();
  if (cache && now - cache.at < SNAPSHOT_TTL_MS) return cache.data;

  const res = await client.send(
    new GetObjectCommand({ Bucket: process.env.SNAPSHOT_BUCKET, Key: KEY }),
  );
  const text = await (
    res.Body as { transformToString: () => Promise<string> }
  ).transformToString();
  const data = JSON.parse(text) as Snapshot;
  cache = { at: now, data };
  return data;
}
```

Nota: `Date.now()` está permitido en runtime real (solo prohibido en scripts de Workflow); aquí es código de Lambda normal.

- [ ] **Step 4: Correr y ver pasar** — Run el filtro de arriba → PASS (2).

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/snapshot.ts backend/src/telegram/__tests__/snapshot.test.ts
git commit -m "✨ feat(telegram): add S3 snapshot loader with in-memory cache"
```

---

### Task 3: Recuperación por palabra clave (`retrieval.ts`)

**Files:**

- Create: `backend/src/telegram/retrieval.ts`
- Test: `backend/src/telegram/__tests__/retrieval.test.ts`

**Interfaces:**

- Consumes: `Snapshot`, `PublicItem` (`@/telegram/types`).
- Produces:
  - `normalize(s: string): string` — lowercase + sin acentos + sin signos.
  - `retrieve(question: string, snap: Snapshot, k?: number): PublicItem[]` — tokeniza la pregunta (palabras ≥ 3 chars, sin stopwords), puntúa cada ítem por nº de keywords presentes en `titulo+texto+ubicacion.nombre+status` (normalizados), devuelve top-K (default 12) con score > 0, ordenado desc.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/telegram/__tests__/retrieval.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { retrieve, normalize } from "@/telegram/retrieval";
import type { Snapshot } from "@/telegram/types";

const snap: Snapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      {
        category: "acopios",
        sourceId: "s",
        externalId: "1",
        titulo: "Centro de acopio Chacao",
        texto: "Reciben agua y comida",
        ubicacion: { lat: 10, lng: -66, nombre: "Chacao" },
      },
      {
        category: "acopios",
        sourceId: "s",
        externalId: "2",
        titulo: "Acopio Petare",
        texto: "Medicinas",
        ubicacion: { lat: 10, lng: -66, nombre: "Petare" },
      },
    ],
    edificios: [
      {
        category: "edificios",
        sourceId: "s",
        externalId: "3",
        titulo: "Edificio colapsado",
        texto: "La Guaira",
      },
    ],
  },
};

describe("normalize", () => {
  it("strips accents and punctuation, lowercases", () => {
    expect(normalize("Médicínas, ¡Agua!")).toBe("medicinas agua");
  });
});

describe("retrieve", () => {
  it("ranks items by keyword overlap and drops zero-score items", () => {
    const res = retrieve("dónde hay agua en chacao", snap, 5);
    expect(res[0].externalId).toBe("1"); // matches agua + chacao
    expect(res.find((i) => i.externalId === "3")).toBeUndefined(); // no overlap
  });

  it("returns empty when nothing matches", () => {
    expect(retrieve("xyzzy plutonio", snap)).toEqual([]);
  });

  it("respects k", () => {
    expect(retrieve("acopio", snap, 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- retrieval` → FAIL.

- [ ] **Step 3: Implementar `retrieval.ts`**

Create `backend/src/telegram/retrieval.ts`:

```ts
import type { PublicItem, Snapshot } from "@/telegram/types";

const STOP = new Set([
  "que",
  "donde",
  "como",
  "cual",
  "cuales",
  "hay",
  "los",
  "las",
  "del",
  "para",
  "con",
  "una",
  "uno",
  "por",
  "qué",
  "dónde",
  "cómo",
  "the",
  "and",
  "está",
  "estan",
  "este",
  "esta",
  "esto",
  "tengo",
  "necesito",
  "puedo",
]);

export function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function haystack(it: PublicItem): string {
  return normalize(
    [it.titulo, it.texto, it.ubicacion?.nombre, it.status, it.category]
      .filter(Boolean)
      .join(" "),
  );
}

export function retrieve(
  question: string,
  snap: Snapshot,
  k = 12,
): PublicItem[] {
  const kws = keywords(question);
  if (kws.length === 0) return [];
  const scored: Array<{ item: PublicItem; score: number }> = [];
  for (const items of Object.values(snap.categories)) {
    for (const item of items) {
      const hay = haystack(item);
      let score = 0;
      for (const kw of kws) if (hay.includes(kw)) score += 1;
      if (score > 0) scored.push({ item, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.item);
}
```

- [ ] **Step 4: Correr y ver pasar** — PASS (4).

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/retrieval.ts backend/src/telegram/__tests__/retrieval.test.ts
git commit -m "✨ feat(telegram): add keyword retrieval over snapshot"
```

---

### Task 4: Armado de prompt (`prompt.ts`)

**Files:**

- Create: `backend/src/telegram/prompt.ts`
- Test: `backend/src/telegram/__tests__/prompt.test.ts`

**Interfaces:**

- Consumes: `PublicItem` (`@/telegram/types`).
- Produces: `buildContext(items: PublicItem[]): string` — bloque numerado con categoría, título, texto, ubicación y fuente por ítem. (El system prompt viene de CONFIG; aquí solo armamos el contexto + el mensaje de usuario.)
  - `buildUserText(question: string, items: PublicItem[]): string` — contexto + la pregunta, con instrucción de citar la fuente y de decir "No tengo ese dato" si el contexto no responde.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/telegram/__tests__/prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildUserText } from "@/telegram/prompt";
import type { PublicItem } from "@/telegram/types";

const items: PublicItem[] = [
  {
    category: "acopios",
    sourceId: "sismovenezuela",
    externalId: "1",
    titulo: "Centro Chacao",
    texto: "Agua y comida",
    ubicacion: { lat: 10, lng: -66, nombre: "Chacao" },
  },
];

describe("buildUserText", () => {
  it("includes the question, the context items and the source", () => {
    const t = buildUserText("dónde hay agua", items);
    expect(t).toContain("dónde hay agua");
    expect(t).toContain("Centro Chacao");
    expect(t).toContain("sismovenezuela");
    expect(t.toLowerCase()).toContain("no tengo ese dato");
  });

  it("handles empty context", () => {
    const t = buildUserText("hola", []);
    expect(t).toContain("hola");
    expect(t.toLowerCase()).toContain("no tengo ese dato");
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- prompt` → FAIL.

- [ ] **Step 3: Implementar `prompt.ts`**

Create `backend/src/telegram/prompt.ts`:

```ts
import type { PublicItem } from "@/telegram/types";

export function buildContext(items: PublicItem[]): string {
  if (items.length === 0) return "(sin información relevante en los datos)";
  return items
    .map((it, i) => {
      const loc = it.ubicacion?.nombre
        ? ` | Ubicación: ${it.ubicacion.nombre}`
        : "";
      const st = it.status ? ` | Estado: ${it.status}` : "";
      return `${i + 1}. [${it.category}] ${it.titulo} — ${it.texto}${loc}${st} | Fuente: ${it.sourceId}`;
    })
    .join("\n");
}

export function buildUserText(question: string, items: PublicItem[]): string {
  return [
    "Información disponible sobre el terremoto de Venezuela:",
    buildContext(items),
    "",
    `Pregunta: ${question}`,
    "",
    'Responde en español, breve y claro, usando SOLO la información de arriba y citando la fuente. Si la información no permite responder, di exactamente "No tengo ese dato".',
  ].join("\n");
}
```

- [ ] **Step 4: Correr y ver pasar** — PASS (2).

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/prompt.ts backend/src/telegram/__tests__/prompt.test.ts
git commit -m "✨ feat(telegram): add prompt/context builder"
```

---

### Task 5: Cliente Bedrock (`bedrock.ts`)

**Files:**

- Create: `backend/src/telegram/bedrock.ts`
- Test: `backend/src/telegram/__tests__/bedrock.test.ts`
- Modify: `backend/package.json` (añadir `@aws-sdk/client-bedrock-runtime`)

**Interfaces:**

- Consumes: `@aws-sdk/client-bedrock-runtime` (`ConverseCommand`).
- Produces: `askBedrock(modelId, system, userText, deps?): Promise<{ text: string; tokensIn: number; tokensOut: number }>` — llama `ConverseCommand` con `system=[{text}]`, `messages=[{role:"user",content:[{text}]}]`, `inferenceConfig={maxTokens:512,temperature:0.2}`. Devuelve el texto y los tokens de `usage`. `deps.client` inyectable.

- [ ] **Step 1: Añadir dependencia**

Add `"@aws-sdk/client-bedrock-runtime": "^3.600.0"` a `dependencies` de `backend/package.json`. Run `npm install` en la raíz.

- [ ] **Step 2: Escribir el test que falla**

Create `backend/src/telegram/__tests__/bedrock.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { askBedrock } from "@/telegram/bedrock";

const brMock = mockClient(BedrockRuntimeClient);
beforeEach(() => brMock.reset());

describe("askBedrock", () => {
  it("returns the text and token usage from Converse", async () => {
    brMock.on(ConverseCommand).resolves({
      output: {
        message: {
          role: "assistant",
          content: [{ text: "Hay acopio en Chacao." }],
        },
      },
      usage: { inputTokens: 120, outputTokens: 15 },
    });
    const r = await askBedrock("amazon.nova-lite-v1:0", "system", "user text");
    expect(r.text).toBe("Hay acopio en Chacao.");
    expect(r.tokensIn).toBe(120);
    expect(r.tokensOut).toBe(15);
    const input = brMock.commandCalls(ConverseCommand)[0].args[0].input;
    expect(input.modelId).toBe("amazon.nova-lite-v1:0");
  });
});
```

- [ ] **Step 3: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- bedrock` → FAIL.

- [ ] **Step 4: Implementar `bedrock.ts`**

Create `backend/src/telegram/bedrock.ts`:

```ts
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

interface Deps {
  client: Pick<BedrockRuntimeClient, "send">;
}

export async function askBedrock(
  modelId: string,
  system: string,
  userText: string,
  deps?: Partial<Deps>,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const br = (deps?.client as Deps["client"]) ?? client;
  const res = await br.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      inferenceConfig: { maxTokens: 512, temperature: 0.2 },
    }),
  );
  const text = res.output?.message?.content?.[0]?.text ?? "";
  return {
    text,
    tokensIn: res.usage?.inputTokens ?? 0,
    tokensOut: res.usage?.outputTokens ?? 0,
  };
}
```

- [ ] **Step 5: Correr y ver pasar** — PASS (1).

- [ ] **Step 6: Commit**

```bash
git add backend/package.json package-lock.json backend/src/telegram/bedrock.ts backend/src/telegram/__tests__/bedrock.test.ts
git commit -m "✨ feat(telegram): add Bedrock Converse client"
```

---

### Task 6: API de Telegram + secreto (`telegramApi.ts`, `secret.ts`)

**Files:**

- Create: `backend/src/telegram/telegramApi.ts`
- Create: `backend/src/telegram/secret.ts`
- Test: `backend/src/telegram/__tests__/telegramApi.test.ts`
- Modify: `backend/package.json` (añadir `@aws-sdk/client-ssm`)

**Interfaces:**

- `telegramApi.ts`: `sendMessage(token, chatId, text, deps?): Promise<void>` (POST a `https://api.telegram.org/bot<token>/sendMessage`); `getMe(token, deps?): Promise<{ username: string }>`. `deps.fetch` inyectable.
- `secret.ts`: `getTelegramToken(deps?): Promise<string>` — `GetParameter` SSM `/venezuelahelp/telegram-token` con `WithDecryption`, cacheado en módulo. `deps.ssm` inyectable.

- [ ] **Step 1: Añadir dependencia** — `"@aws-sdk/client-ssm": "^3.600.0"` a deps; `npm install`.

- [ ] **Step 2: Escribir el test que falla**

Create `backend/src/telegram/__tests__/telegramApi.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { sendMessage, getMe } from "@/telegram/telegramApi";

describe("telegramApi", () => {
  it("sendMessage POSTs chat_id and text to the bot endpoint", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await sendMessage("TOK", 42, "hola", { fetch: fetchMock as any });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/botTOK/sendMessage");
    expect(JSON.parse((init as any).body)).toMatchObject({
      chat_id: 42,
      text: "hola",
    });
  });

  it("getMe returns the bot username", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, result: { username: "vh_bot" } }),
          { status: 200 },
        ),
    );
    const r = await getMe("TOK", { fetch: fetchMock as any });
    expect(r.username).toBe("vh_bot");
  });
});
```

- [ ] **Step 3: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- telegramApi` → FAIL.

- [ ] **Step 4: Implementar `telegramApi.ts`**

Create `backend/src/telegram/telegramApi.ts`:

```ts
type FetchFn = typeof fetch;
interface Deps {
  fetch: FetchFn;
}

const API = "https://api.telegram.org";

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  deps?: Partial<Deps>,
): Promise<void> {
  const f = deps?.fetch ?? fetch;
  const res = await f(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
}

export async function getMe(
  token: string,
  deps?: Partial<Deps>,
): Promise<{ username: string }> {
  const f = deps?.fetch ?? fetch;
  const res = await f(`${API}/bot${token}/getMe`);
  const data = (await res.json()) as { result?: { username?: string } };
  return { username: data.result?.username ?? "" };
}
```

- [ ] **Step 5: Implementar `secret.ts`**

Create `backend/src/telegram/secret.ts`:

```ts
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const NAME = "/venezuelahelp/telegram-token";
let cached: string | null = null;

interface Deps {
  ssm: Pick<SSMClient, "send">;
}

export async function getTelegramToken(deps?: Partial<Deps>): Promise<string> {
  if (cached) return cached;
  const client = (deps?.ssm as Deps["ssm"]) ?? ssm;
  const res = await client.send(
    new GetParameterCommand({ Name: NAME, WithDecryption: true }),
  );
  cached = res.Parameter?.Value ?? "";
  return cached;
}

export function __resetTokenCache() {
  cached = null;
}
```

- [ ] **Step 6: Correr y ver pasar** — `npm test --workspace @venezuelahelp/backend -- telegramApi` → PASS (2).

- [ ] **Step 7: Commit**

```bash
git add backend/package.json package-lock.json backend/src/telegram/telegramApi.ts backend/src/telegram/secret.ts backend/src/telegram/__tests__/telegramApi.test.ts
git commit -m "✨ feat(telegram): add Telegram API client and SSM token loader"
```

---

### Task 7: Handler del webhook (`handler.ts`)

**Files:**

- Create: `backend/src/telegram/handler.ts`
- Test: `backend/src/telegram/__tests__/handler.test.ts`

**Interfaces:**

- Consumes: todo lo anterior + `ConfigRepo` (`@/shared/repos/configRepo`), `QaLogRepo` (`@/shared/repos/qaLogRepo`), `logger`.
- Produces: `handler(event: { body?: string }): Promise<{ statusCode: number; body: string }>` — parsea el update; si no hay mensaje con texto → 200 sin hacer nada; obtiene token + botUsername (getMe cacheado); lee CONFIG; si `shouldRespond` → extrae pregunta → `loadSnapshot` → `retrieve` → si vacío responde canned "No tengo ese dato..." (sin Bedrock) → si no, `buildUserText` + `askBedrock(config.bedrockModelId, config.systemPrompt, ...)` → `sendMessage` → `QaLogRepo.append`. Cualquier error: loguea y responde fallback al chat. SIEMPRE retorna `{statusCode:200}`.

**Design notes:** para testear, el handler acepta `deps` inyectables (configRepo, qaLogRepo, loadSnapshot, askBedrock, sendMessage, getToken, getBotUsername). El default usa las implementaciones reales.

- [ ] **Step 1: Escribir el test que falla**

Create `backend/src/telegram/__tests__/handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { handler } from "@/telegram/handler";
import type { Snapshot } from "@/telegram/types";

const snap: Snapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      {
        category: "acopios",
        sourceId: "s",
        externalId: "1",
        titulo: "Acopio Chacao",
        texto: "agua",
      },
    ],
  },
};

function deps(over = {}) {
  return {
    getToken: vi.fn(async () => "TOK"),
    getBotUsername: vi.fn(async () => "vh_bot"),
    configRepo: {
      get: vi.fn(async () => ({
        scrapeRateMin: 30,
        bedrockModelId: "m",
        systemPrompt: "sys",
        botTriggerMode: "mention" as const,
      })),
    },
    qaLogRepo: { append: vi.fn(async () => {}) },
    loadSnapshot: vi.fn(async () => snap),
    askBedrock: vi.fn(async () => ({
      text: "Hay acopio en Chacao.",
      tokensIn: 10,
      tokensOut: 5,
    })),
    sendMessage: vi.fn(async () => {}),
    ...over,
  };
}

function event(text: string, extra = {}) {
  return {
    body: JSON.stringify({
      message: {
        message_id: 1,
        text,
        chat: { id: 9, type: "group" },
        from: { id: 2, username: "ana" },
        ...extra,
      },
    }),
  };
}

describe("telegram handler", () => {
  it("ignores messages that should not trigger (returns 200, no reply)", async () => {
    const d = deps();
    const res = await handler(event("hola a todos"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("answers a mention: retrieves, calls bedrock, sends, logs", async () => {
    const d = deps();
    const res = await handler(event("@vh_bot dónde hay agua"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.askBedrock).toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalledWith(
      "TOK",
      9,
      "Hay acopio en Chacao.",
      expect.anything(),
    );
    expect(d.qaLogRepo.append).toHaveBeenCalled();
  });

  it("on zero retrieval, replies canned and skips bedrock", async () => {
    const d = deps();
    await handler(event("@vh_bot xyzzy plutonio"), d as any);
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.sendMessage).toHaveBeenCalled();
  });

  it("on bedrock error, sends a fallback and still returns 200", async () => {
    const d = deps({
      askBedrock: vi.fn(async () => {
        throw new Error("ThrottlingException");
      }),
    });
    const res = await handler(event("@vh_bot dónde hay agua"), d as any);
    expect(res.statusCode).toBe(200);
    expect(d.sendMessage).toHaveBeenCalled(); // fallback message
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/backend -- telegram/__tests__/handler` → FAIL.

- [ ] **Step 3: Implementar `handler.ts`**

Create `backend/src/telegram/handler.ts`:

```ts
import { ConfigRepo } from "@/shared/repos/configRepo";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { logger } from "@/shared/logger";
import { getTelegramToken } from "@/telegram/secret";
import { getMe, sendMessage as realSend } from "@/telegram/telegramApi";
import { loadSnapshot as realLoad } from "@/telegram/snapshot";
import { askBedrock as realAsk } from "@/telegram/bedrock";
import { retrieve } from "@/telegram/retrieval";
import { buildUserText } from "@/telegram/prompt";
import { shouldRespond, extractQuestion } from "@/telegram/trigger";
import type { TgUpdate } from "@/telegram/types";

const FALLBACK =
  "Disculpa, estoy con mucha demanda ahora mismo. Intenta de nuevo en un momento.";
const NO_DATA =
  "No tengo ese dato en la información del terremoto que tengo disponible.";

let botUsernameCache: string | null = null;

interface Deps {
  getToken: typeof getTelegramToken;
  getBotUsername: (token: string) => Promise<string>;
  configRepo: Pick<ConfigRepo, "get">;
  qaLogRepo: Pick<QaLogRepo, "append">;
  loadSnapshot: typeof realLoad;
  askBedrock: typeof realAsk;
  sendMessage: typeof realSend;
}

async function defaultBotUsername(token: string): Promise<string> {
  if (botUsernameCache) return botUsernameCache;
  botUsernameCache = (await getMe(token)).username;
  return botUsernameCache;
}

export async function handler(
  event: { body?: string },
  deps?: Partial<Deps>,
): Promise<{ statusCode: number; body: string }> {
  const d: Deps = {
    getToken: deps?.getToken ?? getTelegramToken,
    getBotUsername: deps?.getBotUsername ?? defaultBotUsername,
    configRepo: deps?.configRepo ?? new ConfigRepo(),
    qaLogRepo: deps?.qaLogRepo ?? new QaLogRepo(),
    loadSnapshot: deps?.loadSnapshot ?? realLoad,
    askBedrock: deps?.askBedrock ?? realAsk,
    sendMessage: deps?.sendMessage ?? realSend,
  };

  let chatId: number | undefined;
  let token: string | undefined;
  try {
    const update = JSON.parse(event.body ?? "{}") as TgUpdate;
    const msg = update.message;
    if (!msg || !msg.text) return ok();
    chatId = msg.chat.id;

    token = await d.getToken();
    const botUsername = await d.getBotUsername(token);
    const config = await d.configRepo.get();
    if (!shouldRespond(msg, botUsername, config.botTriggerMode)) return ok();

    const question = extractQuestion(msg, botUsername);
    const snap = await d.loadSnapshot();
    const items = retrieve(question, snap);

    if (items.length === 0) {
      await d.sendMessage(token, chatId, NO_DATA);
      await logQa(
        d,
        chatId,
        question,
        NO_DATA,
        [],
        config.bedrockModelId,
        0,
        0,
      );
      return ok();
    }

    const userText = buildUserText(question, items);
    const ans = await d.askBedrock(
      config.bedrockModelId,
      config.systemPrompt,
      userText,
    );
    const reply = ans.text.trim() || NO_DATA;
    await d.sendMessage(token, chatId, reply);
    await logQa(
      d,
      chatId,
      question,
      reply,
      items.map((i) => `${i.category}/${i.sourceId}#${i.externalId}`),
      config.bedrockModelId,
      ans.tokensIn,
      ans.tokensOut,
    );
    return ok();
  } catch (err) {
    logger.error("telegram handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    if (token && chatId !== undefined) {
      try {
        await d.sendMessage(token, chatId, FALLBACK);
      } catch (e) {
        logger.error("fallback send failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return ok();
  }
}

async function logQa(
  d: Deps,
  chatId: number,
  pregunta: string,
  respuesta: string,
  itemsUsados: string[],
  modelo: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await d.qaLogRepo.append({
    chatId: String(chatId),
    ts: new Date().toISOString(),
    pregunta,
    respuesta,
    itemsUsados,
    tokensIn,
    tokensOut,
    modelo,
    costoEstimado: 0,
    flagged: false,
  });
}

function ok() {
  return { statusCode: 200, body: "ok" };
}
```

- [ ] **Step 4: Correr y ver pasar** — PASS (4). Luego corre la suite backend completa (pristine): `npm test --workspace @venezuelahelp/backend`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/handler.ts backend/src/telegram/__tests__/handler.test.ts
git commit -m "✨ feat(telegram): add webhook handler orchestrating retrieval + bedrock + reply"
```

---

### Task 8: Infra `BotStack`

**Files:**

- Create: `infra/lib/bot-stack.ts`
- Test: `infra/lib/__tests__/bot-stack.test.ts`
- Modify: `infra/bin/app.ts`
- Modify: `infra/package.json` (añadir `@aws-cdk/aws-apigatewayv2-alpha`? NO — usar `aws-cdk-lib/aws-apigatewayv2` que ya es estable en v2.114+)

**Interfaces:**

- Consumes: `DataStack` (table, snapshotBucket).
- Produces: `class BotStack extends Stack` con `NodejsFunction` (entry `backend/src/telegram/handler.ts`, ESM, backend tsconfig), env `TABLE_NAME`/`SNAPSHOT_BUCKET`, grants: tabla RW (QaLog), bucket read (snapshot), SSM read del token, y permiso `bedrock:InvokeModel`+`bedrock:Converse` (resource `*`). Un `HttpApi` con ruta `POST /webhook` → integración Lambda. Output: la URL del webhook.

- [ ] **Step 1: Escribir el test que falla**

Create `infra/lib/__tests__/bot-stack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DataStack } from "../data-stack";
import { BotStack } from "../bot-stack";

function template() {
  const app = new App();
  const data = new DataStack(app, "Data");
  const bot = new BotStack(app, "Bot", {
    table: data.table,
    snapshotBucket: data.snapshotBucket,
  });
  return Template.fromStack(bot);
}

describe("BotStack", () => {
  it("creates a Node 20 Lambda for the webhook", () => {
    template().hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
    });
  });
  it("creates an HTTP API", () => {
    template().resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  });
  it("grants bedrock invoke permission", () => {
    const t = template();
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(["bedrock:InvokeModel"]),
          }),
        ]),
      },
    });
  });
});
```

(añade `import { Match } from "aws-cdk-lib/assertions";`)

- [ ] **Step 2: Correr y ver fallar** — `npm test --workspace @venezuelahelp/infra -- bot` → FAIL.

- [ ] **Step 3: Implementar `bot-stack.ts`**

Create `infra/lib/bot-stack.ts`:

```ts
import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";

export interface BotStackProps extends StackProps {
  table: dynamodb.Table;
  snapshotBucket: s3.Bucket;
}

export class BotStack extends Stack {
  constructor(scope: Construct, id: string, props: BotStackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, "TelegramFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../backend/src/telegram/handler.ts"),
      handler: "handler",
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE_NAME: props.table.tableName,
        SNAPSHOT_BUCKET: props.snapshotBucket.bucketName,
      },
      bundling: {
        format: OutputFormat.ESM,
        tsconfig: path.join(__dirname, "../../backend/tsconfig.json"),
      },
    });

    props.table.grantReadWriteData(fn);
    props.snapshotBucket.grantRead(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/venezuelahelp/telegram-token`,
        ],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:Converse"],
        resources: ["*"],
      }),
    );

    const api = new HttpApi(this, "BotApi");
    api.addRoutes({
      path: "/webhook",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("BotIntegration", fn),
    });

    new CfnOutput(this, "WebhookUrl", { value: `${api.apiEndpoint}/webhook` });
  }
}
```

- [ ] **Step 4: Modificar `bin/app.ts`** — añadir:

```ts
import { BotStack } from "../lib/bot-stack";
// ...después de DataStack/ScraperStack:
new BotStack(app, "VenezuelaHelpBotStack", {
  env,
  table: data.table,
  snapshotBucket: data.snapshotBucket,
});
```

- [ ] **Step 5: Correr y ver pasar** — `npm test --workspace @venezuelahelp/infra -- bot` → PASS (3). Si el assert de bedrock falla por la forma del statement, ajusta el matcher (la acción puede serializarse como string único en vez de array) usando `Match.arrayWith`/`Match.anyValue` sobre `Statement`.

- [ ] **Step 6: Commit**

```bash
git add infra/lib/bot-stack.ts infra/lib/__tests__/bot-stack.test.ts infra/bin/app.ts infra/package.json package-lock.json
git commit -m "🏗️ feat(infra): add BotStack (HTTP API webhook + Lambda + bedrock/ssm grants)"
```

---

### Task 9: Verificación + deploy + webhook + smoke

- [ ] **Step 1: Suite + build** — `npm test` (todo verde) y `npm run build` (limpio).

- [ ] **Step 2: Synth** — `cd infra && npx cdk synth --profile VenezuelaHelp` (3 stacks).

- [ ] **Step 3 (requiere AWS): deploy** — `npx cdk deploy VenezuelaHelpBotStack --profile VenezuelaHelp --require-approval never`. Anota el output `WebhookUrl`.

- [ ] **Step 4: Registrar el webhook en Telegram** — leyendo el token de SSM (no lo imprimas):

```bash
TOKEN=$(aws ssm get-parameter --name /venezuelahelp/telegram-token --with-decryption --profile VenezuelaHelp --region us-east-1 --query "Parameter.Value" --output text)
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook" -d "url=<WEBHOOK_URL>" ; echo
curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | python3 -m json.tool
```

Expected: `setWebhook` → `{"ok":true,...}` y `getWebhookInfo` muestra la URL.

- [ ] **Step 5: Smoke test** — el usuario agrega el bot a un grupo y lo @menciona con una pregunta (p. ej. "@vh_bot ¿dónde hay acopios?").
  - **Si Bedrock ya tiene cupo:** el bot responde citando la fuente.
  - **Si Bedrock sigue throttled:** el bot responde el mensaje de fallback (y el error queda en CloudWatch). El pipeline (webhook → retrieval → intento Bedrock → reply) queda validado igual.
  - Verificar logs: `aws logs filter-log-events --log-group-name /aws/lambda/<TelegramFn> --filter-pattern "telegram" ...`

- [ ] **Step 6: Commit final** — `git commit -m "✅ test(fase3): green full suite for telegram bot" --allow-empty`

---

## Self-Review

**Cobertura del spec (Fase 3):**

- §7 bot: webhook (Task 8), disparo mención/comando (Task 1), retrieval por palabra clave (Task 3), prompt + Bedrock barato (Tasks 4–5), reply + log Q&A (Task 7), token en SSM (Task 6), siempre 200 + fallback ante throttle (Task 7). ✓
- Reutiliza `ConfigRepo`/`QaLogRepo` de Fase 1. ✓
- Retrieval sobre `snapshot.json` (no scan DynamoDB) — barato. ✓

**Placeholders:** sin TBD; todo el código está completo. ✓

**Consistencia de tipos:** `Snapshot`/`PublicItem` (Task 1) consumidos por 2/3/4/7; `askBedrock` firma (Task 5) consumida por 7; `shouldRespond`/`extractQuestion` (Task 1) por 7. ✓

**Dependencias externas (no bloquean el build):** cupo de Bedrock (caso de Support del usuario) y registro del webhook + alta del bot en el grupo (Task 9 Steps 4–5). El código queda listo y desplegado; la respuesta en vivo depende del cupo.

**Fuera de alcance:** frontends (Fases 4–5), reconfiguración de cadencia/modelo desde admin (Fase 5), rate-limiting por usuario (fast-follow).

# Bot Telemetría + Paginación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los **Bloques C y D** del spec `docs/superpowers/specs/2026-07-02-observabilidad-admin-bot-y-publico-status-design.md` (PR `feat/bot-telemetria-paginacion`): (C1) telemetría de intents en `QaLog` con fin de la degradación silenciosa agente→RAG, (C2) mensaje NO_DATA orientador compartido en el fallback RAG clásico, (C3) validación de coordenadas en `handleLocation`, y (D) paginación «Ver más» en las listas de categoría del menú del bot.

**Architecture:** Todo el cambio vive en el Lambda del bot (`VenezuelaHelpBotStack`): `backend/src/telegram/` + el tipo `QaLogEntry` de `backend/src/shared/types.ts`. Sin cambios de infra, DynamoDB schema ni frontend. El campo `intent` viaja dentro del Item `QA#<chatId>` existente (el repo hace spread del entry, así que persistirlo es gratis) y lo consumirá el visor del Bloque A (PR 1). La paginación reutiliza el `MenuState` existente (ubicación fresca ≤1h) vía `callback_data` `more:<action>:<offset>`.

**Tech Stack:** TypeScript strict, vitest (+ `aws-sdk-client-mock` para repos), AWS Powertools Logger, Telegram Bot API (inline keyboards), DynamoDB single-table.

## Global Constraints

- **TypeScript strict** siempre; imports con alias `@/` → `backend/src`.
- **Sin `console.log`** → logging estructurado con el `logger` de Powertools (`@/shared/logger`).
- **TDD estricto** con vitest: test que falla → implementación mínima → verde → commit. Correr SIEMPRE desde el workspace: `npm test --workspace @venezuelahelp/backend` (correr desde la raíz rompe el alias `@/`).
- **Conventional Commits con emoji**: `<emoji> <tipo>(<scope>): <descripción imperativa>`. Nunca commitear a `main`; trabajar en la rama `feat/bot-telemetria-paginacion` (worktree aislado desde `origin/main`; NO tocar el árbol del dueño).
- **`callback_data` ≤ 64 bytes** (límite de Telegram). `more:voluntariado:99999` = 22 bytes → holgado, pero el test lo asertará.
- **Ningún fallo nuevo puede romper el flujo actual del bot**: la telemetría y la paginación degradan (ubicación caducada → lista sin distancia; `more:` malformado → home; error al escribir QaLog ya está aislado dentro del try global del handler).
- Los anclajes de línea citados abajo son de los archivos **antes** de empezar; a medida que se avanza, buscar por el snippet de código citado (único en el archivo), no por el número.

---

## Tarea 1 — `intent` opcional en `QaLogEntry`

**Files:**

- `backend/src/shared/types.ts` (interfaz `QaLogEntry`, líneas 177–188)
- `backend/src/shared/repos/__tests__/qaLogRepo.test.ts` (NUEVO — no existe hoy; copiar el estilo de `rateLimitRepo.test.ts` con `mockClient`)

**Interfaces:**

- _Consumes:_ `QaLogRepo.append(e: QaLogEntry): Promise<void>` (`backend/src/shared/repos/qaLogRepo.ts:17` — hace `Item: { PK: QA_PK(e.chatId), SK: e.ts, ...e, ttl }`, o sea que el campo nuevo persiste sin tocar el repo).
- _Produces:_ `QaLogEntry` con campo nuevo `intent?: string`.

### Pasos

- [ ] **Test que falla.** Crear `backend/src/shared/repos/__tests__/qaLogRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import type { QaLogEntry } from "@/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

describe("QaLogRepo", () => {
  it("persiste el intent opcional dentro del Item QA#", async () => {
    ddbMock.on(PutCommand).resolves({});
    const entry: QaLogEntry = {
      chatId: "9",
      ts: "2026-07-02T12:00:00.000Z",
      pregunta: "hola",
      respuesta: "¡Hola!",
      itemsUsados: [],
      tokensIn: 0,
      tokensOut: 0,
      modelo: "m",
      costoEstimado: 0,
      flagged: false,
      intent: "greeting",
    };
    await new QaLogRepo().append(entry);
    const put = ddbMock.commandCalls(PutCommand)[0].args[0].input;
    expect(put.Item).toMatchObject({
      PK: "QA#9",
      SK: "2026-07-02T12:00:00.000Z",
      intent: "greeting",
    });
  });

  it("sigue aceptando entradas SIN intent (retrocompatible)", async () => {
    ddbMock.on(PutCommand).resolves({});
    const entry: QaLogEntry = {
      chatId: "9",
      ts: "2026-07-02T12:00:00.000Z",
      pregunta: "q",
      respuesta: "r",
      itemsUsados: [],
      tokensIn: 0,
      tokensOut: 0,
      modelo: "m",
      costoEstimado: 0,
      flagged: false,
    };
    await new QaLogRepo().append(entry);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
  });
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/shared/repos/__tests__/qaLogRepo.test.ts` → falla en compilación/type-check del test: `Object literal may only specify known properties, and 'intent' does not exist in type 'QaLogEntry'`.
- [ ] **Implementación mínima.** En `backend/src/shared/types.ts`, dentro de `QaLogEntry` (tras `flagged: boolean;`, línea 187):

```ts
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
  // Rama del handler que produjo la respuesta (telemetría; Bloque C1):
  // greeting | bare_search | pending_search | help_cry | help_guide |
  // bare_category | agent_saludar|contar|listar|buscar|rechazado |
  // agent_error_fallback | rag_count | rag_retrieve
  intent?: string;
}
```

- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/shared/repos/__tests__/qaLogRepo.test.ts` → 2 passed.
- [ ] **Commit.** `git add backend/src/shared/types.ts backend/src/shared/repos/__tests__/qaLogRepo.test.ts && git commit -m "✨ feat(backend): añade campo opcional intent a QaLogEntry"`

---

## Tarea 2 — `answerWithTools` expone el `intent` de la herramienta enrutada

**Files:**

- `backend/src/telegram/agent.ts` (interfaz `AgentResult` líneas 115–121; returns en líneas 154–246)
- `backend/src/telegram/__tests__/agent.test.ts` (añadir tests al final del `describe("answerWithTools (agente sobre el JSON)")`)

**Interfaces:**

- _Consumes:_ `route.name` del router (`saludar | fuera_de_tema | contar | listar | buscar`).
- _Produces:_ `AgentResult` gana `intent: string` (obligatorio). Mapeo: `saludar→"agent_saludar"`, `fuera_de_tema→"agent_rechazado"`, `contar→"agent_contar"`, `listar→"agent_listar"`, `buscar` (las 3 sub-ramas: sin resultados, match por nombre, redacción Bedrock) `→"agent_buscar"`.

```ts
export interface AgentResult {
  reply: string;
  kind: AgentKind;
  intent: string; // "agent_<herramienta>"; fuera_de_tema → "agent_rechazado"
  itemsUsed: string[];
  tokensIn: number;
  tokensOut: number;
}
```

### Pasos

- [ ] **Test que falla.** Añadir al final del describe en `backend/src/telegram/__tests__/agent.test.ts` (el helper `route(name, input)` y los fixtures `snap`/`config` ya existen en el archivo):

```ts
it.each([
  ["saludar", {}, "agent_saludar"],
  ["fuera_de_tema", {}, "agent_rechazado"],
  ["contar", { category: "desaparecidos" }, "agent_contar"],
  ["listar", { category: "desaparecidos" }, "agent_listar"],
] as const)(
  "expone el intent de la herramienta: %s → %s",
  async (tool, input, intent) => {
    const r = await answerWithTools("pregunta", snap, config, {
      routeTools: route(tool, input),
      askBedrock: vi.fn(async () => ({
        text: "ok",
        tokensIn: 1,
        tokensOut: 1,
      })),
    });
    expect(r.intent).toBe(intent);
  },
);

it("buscar expone agent_buscar incluso en la rama sin resultados", async () => {
  const r = await answerWithTools("xyzzy plutonio", snap, config, {
    routeTools: route("buscar", { consulta: "xyzzy plutonio" }),
    askBedrock: vi.fn(async () => ({ text: "", tokensIn: 0, tokensOut: 0 })),
  });
  expect(r.intent).toBe("agent_buscar");
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/agent.test.ts` → falla: `Property 'intent' does not exist on type 'AgentResult'` (o `expected undefined to be 'agent_saludar'`).
- [ ] **Implementación mínima** en `backend/src/telegram/agent.ts`:
  1. Añadir `intent: string;` a `AgentResult` (tras `kind: AgentKind;`, línea 117), con el comentario del bloque de Interfaces de arriba.
  2. Añadir el campo `intent` a CADA return de `answerWithTools`:
     - Return de `if (route.name === "saludar")` (línea 154): añadir `intent: "agent_saludar",` tras `kind: "saludo",`.
     - Return de `if (route.name === "fuera_de_tema")` (línea 164): añadir `intent: "agent_rechazado",` tras `kind: "rechazado",`.
     - Return de `if (route.name === "contar")` (línea 174): añadir `intent: "agent_contar",` tras `kind: "respuesta",`.
     - Return de `if (route.name === "listar")` (línea 187): añadir `intent: "agent_listar",` tras `kind: "respuesta",`.
     - Los TRES returns de la rama `buscar` (sin resultados línea 211, match por nombre línea 226, redacción Bedrock línea 240): añadir `intent: "agent_buscar",` tras `kind: "respuesta",` en cada uno.
- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/agent.test.ts` → todos passed (los tests previos del archivo no asertan `intent`, no se rompen).
- [ ] **Suite del handler sigue verde** (consume `AgentResult` pero no exhaustivamente): `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → passed.
- [ ] **Commit.** `git add backend/src/telegram/agent.ts backend/src/telegram/__tests__/agent.test.ts && git commit -m "✨ feat(telegram): answerWithTools expone el intent de la herramienta enrutada"`

---

## Tarea 3 — `logQa` con `intent` obligatorio + reporte en TODAS las ramas del handler

**Files:**

- `backend/src/telegram/handler.ts` (función `logQa` líneas 712–734 y sus 10 call sites)
- `backend/src/telegram/__tests__/handler.test.ts` (añadir un describe nuevo)

**Interfaces:**

- _Consumes:_ `QaLogEntry.intent?` (Tarea 1), `AgentResult.intent` (Tarea 2).
- _Produces:_ firma nueva (parámetro FINAL obligatorio, así el compilador obliga a cubrir los 10 call sites):

```ts
async function logQa(
  d: Deps,
  chatId: number,
  pregunta: string,
  respuesta: string,
  itemsUsados: string[],
  modelo: string,
  tokensIn: number,
  tokensOut: number,
  intent: string,
): Promise<void>;
```

Mapa rama → intent (call sites por línea actual de `handler.ts`):

| Rama (anclaje)                                                           | logQa en | intent                |
| ------------------------------------------------------------------------ | -------- | --------------------- |
| `if (isGreeting(question))` (L382)                                       | L385     | `greeting`            |
| `if (pendingPersonSearch(convState, Date.now()))` (L402)                 | L409     | `pending_search`      |
| `if (isBareSearchIntent(question))` (L425)                               | L434     | `bare_search`         |
| `if (isHelpCry(question))` (L449)                                        | L455     | `help_cry`            |
| `if (isHelpRequest(question))` (L469)                                    | L472     | `help_guide`          |
| `const catAction = bareCategoryAction(question); if (catAction)` (L487)  | L495     | `bare_category`       |
| éxito del agente (tras `await d.sendMessage(token, chatId, reply)` L532) | L533     | `r.intent` (dinámico) |
| fallback `const count = countAnswer(...)` (L552)                         | L555     | `rag_count`           |
| fallback `items.length === 0` → NO_DATA (L559)                           | L561     | `rag_retrieve`        |
| fallback RAG + Bedrock (L573)                                            | L580     | `rag_retrieve`        |

### Pasos

- [ ] **Test que falla.** Añadir al final de `describe("telegram handler", ...)` en `backend/src/telegram/__tests__/handler.test.ts` (los helpers `deps`/`event` ya existen):

```ts
describe("telemetría de intents (QaLog.intent)", () => {
  it.each([
    ["hola", "greeting"],
    ["buscar a una persona", "bare_search"],
    ["necesito ayuda", "help_cry"],
    ["Cómo puedo solicitar ayuda", "help_guide"],
    ["acopios", "bare_category"],
  ])("'%s' registra intent %s", async (text, intent) => {
    const d = deps();
    await handler(event(text, { chat: { id: 9, type: "private" } }), d as any);
    expect(d.qaLogRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ intent }),
    );
  });

  it("con pendingSearch activo registra intent pending_search", async () => {
    const d = deps({
      menuState: {
        get: vi.fn(async () => ({
          pendingSearch: "persona",
          pendingSearchAt: new Date().toISOString(),
        })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
        setPendingSearch: vi.fn(async () => {}),
        clearPendingSearch: vi.fn(async () => {}),
      },
    });
    await handler(
      event("Pedro Gonzalez", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.qaLogRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "pending_search" }),
    );
  });

  it("respuesta del agente registra el intent de la herramienta (agent_buscar)", async () => {
    const d = deps(); // routeTools por defecto elige "buscar"
    await handler(
      event("dónde hay agua", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.qaLogRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "agent_buscar" }),
    );
  });

  it("fallback RAG tras fallo del agente registra rag_retrieve", async () => {
    const d = deps({
      routeTools: vi.fn(async () => {
        throw new Error("Bedrock 424");
      }),
    });
    await handler(
      event("dónde hay agua", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.qaLogRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "rag_retrieve" }),
    );
  });

  it("fallback de conteo tras fallo del agente registra rag_count", async () => {
    const d = deps({
      routeTools: vi.fn(async () => {
        throw new Error("Bedrock 424");
      }),
    });
    await handler(
      event("cuántos acopios hay", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(d.askBedrock).not.toHaveBeenCalled();
    expect(d.qaLogRepo.append).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "rag_count" }),
    );
  });
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → los 9 tests nuevos fallan con `expected ... to have been called with objectContaining {intent: ...}` (el entry actual no lleva `intent`).
- [ ] **Implementación mínima** en `backend/src/telegram/handler.ts`:
  1. Reemplazar la función `logQa` completa (líneas 712–734) por:

```ts
async function logQa(
  d: Deps,
  chatId: number,
  pregunta: string,
  respuesta: string,
  itemsUsados: string[],
  modelo: string,
  tokensIn: number,
  tokensOut: number,
  intent: string,
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
    intent,
  });
}
```

2. Actualizar los 10 call sites añadiendo el intent como ÚLTIMO argumento (el compilador en strict marca cualquiera que falte). Ejemplos exactos (mismo patrón en todos):

Rama saludo (L385):

```ts
await logQa(
  d,
  chatId,
  question,
  GREETING,
  [],
  config.bedrockModelId,
  0,
  0,
  "greeting",
);
```

Rama pendingSearch (L409): último arg `"pending_search"` (tras `0,\n        0,`).
Rama `isBareSearchIntent` (L434): último arg `"bare_search"`.
Rama `isHelpCry` (L455): último arg `"help_cry"`.
Rama `isHelpRequest` (L472): último arg `"help_guide"`.
Rama `catAction` (L495): último arg `"bare_category"`.

Éxito del agente (L533):

```ts
await logQa(
  d,
  chatId,
  question,
  reply,
  r.itemsUsed,
  config.bedrockModelId,
  r.tokensIn,
  r.tokensOut,
  r.intent,
);
```

Fallback conteo (L555):

```ts
await logQa(
  d,
  chatId,
  question,
  count,
  [],
  config.bedrockModelId,
  0,
  0,
  "rag_count",
);
```

Fallback sin resultados (L561): último arg `"rag_retrieve"`.
Fallback RAG+Bedrock (L580):

```ts
await logQa(
  d,
  chatId,
  question,
  reply,
  items.map((i) => `${i.category}/${i.sourceId}#${i.externalId}`),
  config.bedrockModelId,
  ans.tokensIn,
  ans.tokensOut,
  "rag_retrieve",
);
```

- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → todos passed (los tests previos usan `toHaveBeenCalled()` sobre `append`, no la forma del entry: no se rompen).
- [ ] **Commit.** `git add backend/src/telegram/handler.ts backend/src/telegram/__tests__/handler.test.ts && git commit -m "✨ feat(telegram): registra el intent de cada rama del handler en QaLog"`

---

## Tarea 4 — Telemetría estructurada al degradar agente→RAG (`agent_error_fallback`)

**Files:**

- `backend/src/telegram/handler.ts` (bloque `catch` de `answerWithTools`, líneas 544–549)
- `backend/src/telegram/__tests__/handler.test.ts`

**Interfaces:**

- _Consumes:_ `logger` de Powertools (`@/shared/logger`, ya importado en `handler.ts:5`).
- _Produces:_ `logger.error("agente tool-use falló; degradando a RAG clásico", { chatId, intent: "agent_error_fallback", error })`. Sube de `warn` a `error` (es una degradación de servicio, no un aviso) y añade el campo `intent` para poder correlacionar en CloudWatch con los QaLog `rag_*`. **Decisión:** `agent_error_fallback` viaja en el log estructurado; las filas de QaLog del fallback llevan `rag_count`/`rag_retrieve` (Tarea 3), que son más específicas para el visor del admin.

### Pasos

- [ ] **Test que falla.** En `backend/src/telegram/__tests__/handler.test.ts`, añadir el import arriba del todo (junto a los imports existentes):

```ts
import { logger } from "@/shared/logger";
```

y este test dentro del describe `"telemetría de intents (QaLog.intent)"` (Tarea 3):

```ts
it("cuando answerWithTools lanza, emite log estructurado agent_error_fallback", async () => {
  const errorSpy = vi
    .spyOn(logger, "error")
    .mockImplementation(() => undefined as any);
  try {
    const d = deps({
      routeTools: vi.fn(async () => {
        throw new Error("Bedrock 424");
      }),
    });
    await handler(
      event("dónde hay agua", { chat: { id: 9, type: "private" } }),
      d as any,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("agente tool-use falló"),
      expect.objectContaining({
        chatId: 9,
        intent: "agent_error_fallback",
        error: "Bedrock 424",
      }),
    );
  } finally {
    errorSpy.mockRestore();
  }
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → falla: `logger.error` no fue llamado con esos argumentos (hoy es `logger.warn` sin `intent`).
- [ ] **Implementación mínima.** En `handler.ts`, reemplazar el catch (líneas 544–549):

```ts
    } catch (e) {
      logger.warn("agente tool-use falló; usando RAG clásico", {
        chatId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
```

por:

```ts
    } catch (e) {
      // Fin de la degradación silenciosa: error estructurado + intent para
      // correlacionar en CloudWatch con las filas QaLog rag_* que siguen.
      logger.error("agente tool-use falló; degradando a RAG clásico", {
        chatId,
        intent: "agent_error_fallback",
        error: e instanceof Error ? e.message : String(e),
      });
    }
```

- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → passed.
- [ ] **Commit.** `git add backend/src/telegram/handler.ts backend/src/telegram/__tests__/handler.test.ts && git commit -m "✨ feat(telegram): telemetría estructurada agent_error_fallback al degradar agente→RAG"`

---

## Tarea 5 — NO_DATA orientador compartido en el fallback RAG (C2)

**Files:**

- `backend/src/telegram/agent.ts` (const `NO_DATA` líneas 19–23; usos en líneas 212 y 241)
- `backend/src/telegram/handler.ts` (const local `NO_DATA` líneas 56–57; usos en líneas 560, 567, 578; import de `@/telegram/agent` líneas 24–28)
- `backend/src/telegram/__tests__/handler.test.ts`

**Interfaces:**

- _Produces:_ `export const NO_DATA_GUIDE` en `agent.ts` (mismo texto actual: `"No encontré información sobre eso. Puedo ayudarte a buscar una persona por su nombre, o a ver centros de acopio, refugios, hospitales y solicitudes de ayuda. ¿Qué necesitas? 🔎"`).
- _Consumes:_ el handler lo importa y ELIMINA su `NO_DATA` seco (`"No tengo ese dato en la información del terremoto que tengo disponible."`). No hay import circular nuevo: `handler.ts` ya importa `answerWithTools`/`GREETING` de `agent.ts`.

### Pasos

- [ ] **Test que falla.** Añadir en `handler.test.ts`, dentro del describe principal:

```ts
it("fallback RAG sin resultados responde con el mensaje orientador, no el seco", async () => {
  const d = deps({
    routeTools: vi.fn(async () => {
      throw new Error("Bedrock 424");
    }),
  });
  await handler(
    event("xyzzy plutonio", { chat: { id: 9, type: "private" } }),
    d as any,
  );
  expect(d.askBedrock).not.toHaveBeenCalled();
  const reply = (d.sendMessage as any).mock.calls[0][2] as string;
  expect(reply).toContain("No encontré información");
  expect(reply).not.toContain("No tengo ese dato");
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → falla: el reply es `"No tengo ese dato en la información del terremoto que tengo disponible."`.
- [ ] **Implementación mínima.**
  1. En `agent.ts`, renombrar y exportar la constante (líneas 19–23):

```ts
// Fallback que GUÍA en vez de cortar (patrón "Data Boundary" + tono de
// alo-ai-engine): cuando no hay datos para la consulta, orienta sobre qué sí
// puede responder, sin inventar. Compartido con el fallback RAG del handler.
export const NO_DATA_GUIDE =
  "No encontré información sobre eso. Puedo ayudarte a buscar una persona por su nombre, o a ver centros de acopio, refugios, hospitales y solicitudes de ayuda. ¿Qué necesitas? 🔎";
```

y actualizar sus 2 usos internos: `reply: NO_DATA,` (línea 212) → `reply: NO_DATA_GUIDE,` y `reply: ans.text.trim() || NO_DATA,` (línea 241) → `reply: ans.text.trim() || NO_DATA_GUIDE,`. 2. En `handler.ts`: - Borrar las líneas 56–57 (`const NO_DATA = "No tengo ese dato en la información del terremoto que tengo disponible.";`). - Ampliar el import existente: `import { answerWithTools, answerPersonSearch, GREETING, NO_DATA_GUIDE } from "@/telegram/agent";` - Sustituir los 3 usos: `await d.sendMessage(token, chatId, NO_DATA);` (línea 560) → `NO_DATA_GUIDE`; el logQa de esa rama (`NO_DATA,` línea 565 aprox.) → `NO_DATA_GUIDE,`; y `const reply = ans.text.trim() || NO_DATA;` (línea 578) → `const reply = ans.text.trim() || NO_DATA_GUIDE;`.

- [ ] **Test verde + regresión.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts src/telegram/__tests__/agent.test.ts` → todos passed (el test existente `"on zero retrieval, replies with guidance"` ya esperaba `"No encontré"` por la vía del agente y sigue verde; grep final: `grep -rn "No tengo ese dato" backend/src` → sin resultados en código fuente).
- [ ] **Commit.** `git add backend/src/telegram/agent.ts backend/src/telegram/handler.ts backend/src/telegram/__tests__/handler.test.ts && git commit -m "♻️ refactor(telegram): comparte el NO_DATA orientador con el fallback RAG clásico"`

---

## Tarea 6 — Validación de coordenadas en `handleLocation` (C3)

**Files:**

- `backend/src/telegram/handler.ts` (función `handleLocation`, líneas 667–710; constantes arriba junto a `FALLBACK`)
- `backend/src/telegram/__tests__/handler.test.ts` (helper `locationEvent(lat, lng)` ya existe, líneas 97–108)

**Interfaces:**

- _Produces:_

```ts
const INVALID_LOCATION =
  "📍 Esa ubicación no parece válida. Vuelve a compartirla con el botón «📍 Compartir ubicación», por favor.";

function validCoords(lat: number, lng: number): boolean; // finitos, |lat|≤90, |lng|≤180 y NO (0,0)
```

- Regla: rechaza fuera de rango ±90/±180 y el par exacto `(0, 0)` (Null Island = GPS roto). **SIN geocerca de Venezuela** (la diáspora usa el bot desde el exterior). Al rechazar: NO se persiste `setLocation`, NO se renderiza categoría; solo el mensaje de reintento.

### Pasos

- [ ] **Test que falla.** Añadir en `handler.test.ts`:

```ts
describe("validación de coordenadas (handleLocation)", () => {
  it.each([
    [91, -66.9],
    [-90.01, -66.9],
    [10.5, 181],
    [10.5, -180.5],
    [0, 0],
  ])(
    "ubicación inválida (%s, %s) → pide reintentar y NO persiste",
    async (lat, lng) => {
      const d = deps();
      await handler(locationEvent(lat, lng), d as any);
      expect(d.menuState.setLocation).not.toHaveBeenCalled();
      expect(d.loadSnapshot).not.toHaveBeenCalled();
      expect(d.sendMessage).toHaveBeenCalledWith(
        "TOK",
        9,
        expect.stringMatching(/ubicación no parece válida/i),
      );
    },
  );

  it("coordenadas límite válidas (-90, 180) SÍ se persisten", async () => {
    const d = deps();
    await handler(locationEvent(-90, 180), d as any);
    expect(d.menuState.setLocation).toHaveBeenCalledWith(
      9,
      -90,
      180,
      expect.any(String),
    );
  });
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → los casos inválidos fallan (`setLocation` SÍ fue llamado hoy).
- [ ] **Implementación mínima.** En `handler.ts`:
  1. Junto a las constantes del tope (tras `BLOCKED_MSG`, línea 70):

```ts
const INVALID_LOCATION =
  "📍 Esa ubicación no parece válida. Vuelve a compartirla con el botón «📍 Compartir ubicación», por favor.";

// Rango WGS84 + descarte de (0,0) ("Null Island": GPS sin señal). SIN geocerca
// de Venezuela: la diáspora consulta desde el exterior.
function validCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}
```

2. En `handleLocation` (línea 667), tras construir `loc` (líneas 673–676) e inmediatamente ANTES de `const state = await safeGetState(d, chatId);`:

```ts
if (!validCoords(loc.lat, loc.lng)) {
  await d.sendMessage(token, chatId, INVALID_LOCATION);
  return ok();
}
```

- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → passed (incluye la regresión existente `"mensaje de ubicación renderiza la categoría pendiente..."` con (10.5, -66.9)).
- [ ] **Commit.** `git add backend/src/telegram/handler.ts backend/src/telegram/__tests__/handler.test.ts && git commit -m "✨ feat(telegram): valida rango de coordenadas y (0,0) en handleLocation"`

---

## Tarea 7 — Paginación en `categoryScreen` + numeración continua en `renderList` (D, parte 1)

**Files:**

- `backend/src/telegram/cards.ts` (firma de `renderList`, líneas 24–57)
- `backend/src/telegram/menu.ts` (función `categoryScreen`, líneas 153–176; `MAX_ITEMS = 8` en línea 19)
- `backend/src/telegram/__tests__/cards.test.ts`
- `backend/src/telegram/__tests__/menu.test.ts`

**Interfaces:**

- _Produces:_

```ts
// cards.ts — numeración continua entre páginas (startIndex = offset global)
export function renderList(
  items: PublicItem[],
  userLoc?: LatLng,
  startIndex = 0,
): RenderedList;

// menu.ts — 4º parámetro nuevo, default 0 (retrocompatible con todos los
// call sites actuales del handler)
export function categoryScreen(
  action: string,
  snap: Snapshot,
  userLoc?: LatLng,
  offset = 0,
): MenuResponse;
```

- Comportamiento: pinta `ordered.slice(offset, offset + 8)`; si `ordered.length > offset + 8`, añade la fila `[{ text: "➕ Ver más", callback_data: `more:${action}:${offset + 8}` }]` ANTES de la fila «⬅️ Volver». Offset más allá del final → cae al mensaje de vacío existente (sin lanzar). El orden es estable entre páginas: por distancia si hay `userLoc`, si no por trust (`Array.prototype.sort` es estable).

### Pasos

- [ ] **Test que falla (cards).** Añadir al final del `describe("renderList", ...)` en `cards.test.ts` (fixture `sinGeo` ya existe):

```ts
it("continúa la numeración desde startIndex (páginas siguientes)", () => {
  const { text } = renderList([sinGeo], undefined, 8);
  expect(text).toContain("9. Punto sin ubicación");
  expect(text).not.toContain("1. Punto sin ubicación");
});
```

- [ ] **Test que falla (menu).** Añadir al final de `menu.test.ts` (helper `item()` y fixture `snap` ya existen):

```ts
describe("categoryScreen — paginación «Ver más»", () => {
  const bigSnap: Snapshot = {
    generatedAt: "t",
    categories: {
      solicitudes: Array.from({ length: 20 }, (_, i) =>
        item({
          category: "solicitudes",
          externalId: String(i),
          titulo: `Solicitud ${i + 1}`,
        }),
      ),
    },
  };

  it("con más de 8 ítems añade «Ver más» con el offset siguiente (≤64 bytes)", () => {
    const r = categoryScreen("voluntariado", bigSnap);
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    const more = flat.find((b: any) => b.text.includes("Ver más"));
    expect(more).toBeTruthy();
    expect(more.callback_data).toBe("more:voluntariado:8");
    expect(more.callback_data.length).toBeLessThanOrEqual(64);
  });

  it("offset=8 pinta la 2ª página con numeración continua", () => {
    const r = categoryScreen("voluntariado", bigSnap, undefined, 8);
    expect(r.text).toContain("9. Solicitud 9");
    expect(r.text).not.toContain("1. Solicitud 1\n");
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    const more = flat.find((b: any) => b.text.includes("Ver más"));
    expect(more.callback_data).toBe("more:voluntariado:16");
  });

  it("en la última página no ofrece «Ver más» pero sí Volver", () => {
    const r = categoryScreen("voluntariado", bigSnap, undefined, 16);
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    expect(flat.some((b: any) => b.text.includes("Ver más"))).toBe(false);
    expect(flat.some((b: any) => b.text.includes("Volver"))).toBe(true);
  });

  it("offset más allá del final muestra el vacío sin lanzar", () => {
    const r = categoryScreen("voluntariado", bigSnap, undefined, 999);
    expect(r.text.toLowerCase()).toContain("no hay registros");
  });

  it("con 8 o menos ítems NO muestra «Ver más» (regresión)", () => {
    const r = categoryScreen("voluntariado", snap); // 1 solicitud en el fixture
    const flat = (r.replyMarkup as any).inline_keyboard.flat();
    expect(flat.some((b: any) => b.text.includes("Ver más"))).toBe(false);
  });
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/cards.test.ts src/telegram/__tests__/menu.test.ts` → fallan los tests nuevos (no existe «Ver más», la numeración empieza en 1, `categoryScreen` ignora el 4º argumento).
- [ ] **Implementación mínima.**
  1. `cards.ts` — firma y numeración (líneas 24–32):

```ts
export function renderList(
  items: PublicItem[],
  userLoc?: LatLng,
  startIndex = 0,
): RenderedList {
  const blocks: string[] = [];
  const buttons: InlineKeyboardButton[][] = [];
  items.forEach((it, i) => {
    const badge = TRUST_BADGE[it.trust ?? "no_verificado"] ?? "";
    const parts = [
      `${startIndex + i + 1}. ${it.titulo}${badge ? `  ·  ${badge}` : ""}`,
    ];
```

(el resto del cuerpo no cambia). 2. `menu.ts` — reemplazar `categoryScreen` completa (líneas 153–176):

```ts
export function categoryScreen(
  action: string,
  snap: Snapshot,
  userLoc?: LatLng,
  offset = 0,
): MenuResponse {
  const selected = selectItems(action, snap);
  const ordered = userLoc
    ? sortByDistance(selected, userLoc)
    : [...selected].sort(byTrust);
  const items = ordered.slice(offset, offset + MAX_ITEMS);
  const title = TITLES[action] ?? "Resultados";
  const back = BACK_TARGET[action] ?? "home";
  if (items.length === 0) {
    return {
      text: `${title}\n\nNo hay registros disponibles ahora mismo. Intenta más tarde 🙏`,
      replyMarkup: backMarkup(back),
    };
  }
  const { text, buttons } = renderList(items, userLoc, offset);
  const rows = [...buttons];
  const next = offset + MAX_ITEMS;
  if (ordered.length > next) {
    // callback_data ≤ 64 bytes: "more:" + acción (≤12) + ":" + offset.
    rows.push([
      { text: "➕ Ver más", callback_data: `more:${action}:${next}` },
    ]);
  }
  rows.push(backRow(back));
  return {
    text: `${title}\n\n${text}`,
    replyMarkup: { inline_keyboard: rows },
  };
}
```

- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/cards.test.ts src/telegram/__tests__/menu.test.ts src/telegram/__tests__/handler.test.ts` → todos passed (los call sites existentes de `categoryScreen(action, snap, loc)` usan el default `offset=0` y no cambian de comportamiento).
- [ ] **Commit.** `git add backend/src/telegram/cards.ts backend/src/telegram/menu.ts backend/src/telegram/__tests__/cards.test.ts backend/src/telegram/__tests__/menu.test.ts && git commit -m "✨ feat(telegram): paginación «Ver más» en categoryScreen con numeración continua"`

---

## Tarea 8 — Callback `more:<action>:<offset>` en `handleCallback` (D, parte 2)

**Files:**

- `backend/src/telegram/handler.ts` (función `handleCallback`, líneas 608–665)
- `backend/src/telegram/__tests__/handler.test.ts` (helper `callbackEvent(data)` ya existe, líneas 84–95)

**Interfaces:**

- _Consumes:_ `categoryScreen(action, snap, loc, offset)` (Tarea 7), `freshLoc(state, now)` (handler.ts:118 — devuelve `undefined` si la ubicación tiene >1h), `LOCATION_ACTIONS` (menu.ts:21).
- _Produces:_ rama nueva en `handleCallback` que parsea `more:`: acción válida + offset entero > 0 → re-render con la ubicación fresca del `MenuState` (caducada → `loc === undefined` → lista ordenada por trust, sin distancia, **sin error** y sin volver a pedir ubicación); `more:` malformado → `homeScreen()` (mismo default que un callback desconocido). Siempre se responde `answerCallbackQuery` (el `finally` existente lo cubre).

### Pasos

- [ ] **Test que falla.** Añadir en `handler.test.ts`:

```ts
describe("callback more: (paginación «Ver más»)", () => {
  const bigSnap: Snapshot = {
    generatedAt: "t",
    categories: {
      acopios: Array.from({ length: 20 }, (_, i) => ({
        category: "acopios",
        sourceId: "s",
        externalId: String(i),
        titulo: `Albergue ${i + 1}`,
        texto: "albergue con camas",
        ubicacion: { lat: 10 + i * 0.01, lng: -66, nombre: "Zona" },
      })),
    },
  };

  it("more:refugios:8 pinta la 2ª página sin volver a pedir ubicación", async () => {
    const d = deps({ loadSnapshot: vi.fn(async () => bigSnap) });
    await handler(callbackEvent("more:refugios:8"), d as any);
    expect(d.menuState.setPending).not.toHaveBeenCalled();
    const [, , text, opts] = (d.sendMessage as any).mock.calls[0];
    expect(text).toContain("9. Albergue");
    expect(opts.replyMarkup.inline_keyboard).toBeTruthy();
    expect(d.answerCallbackQuery).toHaveBeenCalledWith("TOK", "cb1");
  });

  it("more: con ubicación fresca mantiene el orden por distancia", async () => {
    const d = deps({
      loadSnapshot: vi.fn(async () => bigSnap),
      menuState: {
        get: vi.fn(async () => ({
          lastLat: 10,
          lastLng: -66,
          lastLocationAt: new Date().toISOString(),
        })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
        setPendingSearch: vi.fn(async () => {}),
        clearPendingSearch: vi.fn(async () => {}),
      },
    });
    await handler(callbackEvent("more:refugios:8"), d as any);
    const [, , text] = (d.sendMessage as any).mock.calls[0];
    expect(text).toContain("📏"); // pinta distancias
    expect(text).toContain("9. ");
  });

  it("more: con ubicación caducada degrada a lista sin distancia, sin error", async () => {
    const d = deps({
      loadSnapshot: vi.fn(async () => bigSnap),
      menuState: {
        get: vi.fn(async () => ({
          lastLat: 10,
          lastLng: -66,
          lastLocationAt: new Date(
            Date.now() - 2 * 60 * 60 * 1000,
          ).toISOString(),
        })),
        setPending: vi.fn(async () => {}),
        setLocation: vi.fn(async () => {}),
        clearPending: vi.fn(async () => {}),
        setPendingSearch: vi.fn(async () => {}),
        clearPendingSearch: vi.fn(async () => {}),
      },
    });
    await handler(callbackEvent("more:refugios:8"), d as any);
    const [, , text] = (d.sendMessage as any).mock.calls[0];
    expect(text).toContain("9. ");
    expect(text).not.toContain("📏"); // sin distancias
    expect(d.menuState.setPending).not.toHaveBeenCalled(); // no re-pide ubicación
  });

  it.each([["more:refugios:zzz"], ["more:noexiste:8"], ["more:refugios:-8"]])(
    "more: malformado (%s) cae a home sin lanzar",
    async (data) => {
      const d = deps();
      await handler(callbackEvent(data), d as any);
      const [, , text] = (d.sendMessage as any).mock.calls[0];
      expect(text).toContain("VenezuelaHelp"); // homeScreen
      expect(d.answerCallbackQuery).toHaveBeenCalledWith("TOK", "cb1");
    },
  );
});
```

- [ ] **Ver el fallo.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → fallan: hoy `more:refugios:8` no matchea `navScreen` ni `LOCATION_ACTIONS` y cae al `homeScreen` (el texto no contiene `"9. Albergue"`).
- [ ] **Implementación mínima.** En `handleCallback` (handler.ts), insertar la rama entre el bloque `if (nav) { ... }` (cierra en línea 621) y `} else if (LOCATION_ACTIONS.has(data)) {` (línea 622):

```ts
    } else if (data.startsWith("more:")) {
      // Paginación «Ver más»: more:<action>:<offset>. Reutiliza la ubicación
      // fresca del MenuState; si caducó, loc=undefined → lista por trust sin
      // distancia (mismo degrade que "Ver sin ubicación"), sin error.
      const [, action = "", offsetRaw = ""] = data.split(":");
      const offset = Number.parseInt(offsetRaw, 10);
      if (LOCATION_ACTIONS.has(action) && Number.isInteger(offset) && offset > 0) {
        const state = await safeGetState(d, chatId);
        const loc = freshLoc(state, Date.now());
        const snap = await d.loadSnapshot();
        const screen = categoryScreen(action, snap, loc, offset);
        await d.sendMessage(token, chatId, screen.text, {
          replyMarkup: screen.replyMarkup,
        });
      } else {
        const home = homeScreen();
        await d.sendMessage(token, chatId, home.text, {
          replyMarkup: home.replyMarkup,
        });
      }
    } else if (LOCATION_ACTIONS.has(data)) {
```

(No hay imports nuevos: `categoryScreen`, `homeScreen`, `LOCATION_ACTIONS`, `safeGetState` y `freshLoc` ya están disponibles en el módulo.)

- [ ] **Test verde.** `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts` → todos passed (incluidas las regresiones de callbacks `home`/`refugios` existentes).
- [ ] **Commit.** `git add backend/src/telegram/handler.ts backend/src/telegram/__tests__/handler.test.ts && git commit -m "✨ feat(telegram): pagina con more:<action>:<offset> reutilizando la ubicación fresca del MenuState"`

---

## Tarea 9 — Verificación final

**Files:** ninguno nuevo (solo verificación).

### Pasos

- [ ] **Suite completa del backend.** `npm test --workspace @venezuelahelp/backend` → 0 failed (todos los archivos de test, no solo los tocados).
- [ ] **Suite completa del monorepo.** `npm test` desde la raíz → 0 failed (frontends + infra no se tocaron, pero valida que nada cruzado se rompió).
- [ ] **Build.** `npm run build` → compila backend e infra sin errores de TypeScript strict.
- [ ] **Greps de cierre:**
  - `grep -rn "No tengo ese dato" backend/src --include='*.ts' | grep -v __tests__` → 0 resultados (C2 completo).
  - `grep -n "intent" backend/src/telegram/handler.ts | grep logQa -c` → 0 (ningún call site de `logQa` sin actualizar; el compilador ya lo garantiza).
  - `grep -rn "console.log" backend/src/telegram` → 0 resultados.
- [ ] **Working tree limpio:** `git status` → sin cambios sin commitear (regla del proyecto: tree limpio al cerrar el bloque).
- [ ] **Nota de deploy (NO ejecutar en este plan):** al mergear el PR a `main`, GitHub Actions despliega todo; para un deploy manual solo del bot: `cd infra && npx cdk deploy VenezuelaHelpBotStack --require-approval never` (cambio de código = solo mueve el S3Key). Smoke manual sugerido post-deploy: en Telegram, `/menu` → NECESITO AYUDA → Refugios → compartir ubicación → verificar botón «➕ Ver más» y que la 2ª página continúa la numeración; enviar "xyzzy plutonio" y verificar el mensaje orientador; revisar en DynamoDB una fila `QA#<chatId>` reciente con `intent`.

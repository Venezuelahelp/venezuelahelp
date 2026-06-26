# Menú de navegación del bot de Telegram — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un menú guiado con botones inline al bot de Telegram (aportar insumos, voluntariado, y bloque "NECESITO AYUDA" con emergencias, refugios, víveres y animales), con ubicación opcional y ordenado por cercanía, sin romper el flujo de pregunta libre RAG+Bedrock.

**Architecture:** El bot procesa dos tipos de update hoy ignorados (`callback_query` y `message.location`) además del texto. La lógica del menú vive en módulos puros pequeños (`menu`, `cards`, `geo`, `emergencyInfo`); el `handler` solo orquesta. El menú es _data-only_: lee el mismo `snapshot.json` cacheado y **no llama a Bedrock**. El estado mínimo por chat (categoría pendiente + última ubicación) se persiste en el ítem DynamoDB existente del usuario de Telegram.

**Tech Stack:** TypeScript strict, AWS SDK v3 (`@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`), vitest + `aws-sdk-client-mock`, alias `@/` → `backend/src`.

## Global Constraints

- TypeScript **strict** siempre. Imports con alias `@/` → `backend/src`.
- Sin `console.log`: logging estructurado con `logger` de `@/shared/logger`.
- El menú **no debe invocar Bedrock**; solo la pregunta de texto libre conserva su rate-limit y su llamada a Bedrock.
- Un fallo en DynamoDB (estado del menú) **no debe romper** la respuesta: degradar a "sin ubicación" y `logger.warn` (mismo patrón que el `upsert` aislado actual del handler).
- **NO usar `parse_mode`**: texto plano. Los enlaces a Google Maps van como botones inline `url`; los teléfonos como texto (Telegram autolinkea números en formato internacional).
- Tests: correr un archivo con `npm test --workspace @venezuelahelp/backend -- <ruta-relativa-a-backend>` (el script es `vitest run`). El alias `@/` solo resuelve desde el workspace backend.
- Cada commit usa Conventional Commits con emoji y termina con el trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Rama de trabajo: `feat/telegram-menu` (ya creada desde `main`).

---

## Estructura de archivos

| Archivo                                 | Acción    | Responsabilidad                                                    |
| --------------------------------------- | --------- | ------------------------------------------------------------------ |
| `backend/src/telegram/geo.ts`           | Crear     | `haversineKm` + `sortByDistance`. Puro.                            |
| `backend/src/telegram/telegramApi.ts`   | Modificar | `sendMessage` con `replyMarkup`; nueva `answerCallbackQuery`.      |
| `backend/src/telegram/types.ts`         | Modificar | Tipos de markup, `callback_query`, `location`.                     |
| `backend/src/telegram/emergencyInfo.ts` | Crear     | Constantes de emergencia (placeholders) + `renderEmergency`. Puro. |
| `backend/src/telegram/cards.ts`         | Crear     | `renderList`: tarjetas de `PublicItem` + botones de mapa. Puro.    |
| `backend/src/telegram/menu.ts`          | Crear     | Árbol del menú + pantallas + selección/sub-filtro. Puro.           |
| `backend/src/telegram/menuState.ts`     | Crear     | `MenuStateRepo` (DynamoDB): pendingCategory + última ubicación.    |
| `backend/src/telegram/trigger.ts`       | Modificar | `isMenuCommand`.                                                   |
| `backend/src/telegram/handler.ts`       | Modificar | Ramas `callback_query` / `location` / texto.                       |

Orden de tareas (cada una con deliverable testeable independiente):

1. `geo.ts` · 2. `telegramApi.ts` (+ tipos de markup) · 3. `emergencyInfo.ts` · 4. `cards.ts` · 5. `menu.ts` · 6. `menuState.ts` · 7. `handler.ts` (+ tipos de update + `trigger.ts`).

---

### Task 1: Geometría (`geo.ts`)

**Files:**

- Create: `backend/src/telegram/geo.ts`
- Test: `backend/src/telegram/__tests__/geo.test.ts`

**Interfaces:**

- Produces:
  - `interface LatLng { lat: number; lng: number }`
  - `haversineKm(a: LatLng, b: LatLng): number`
  - `sortByDistance<T extends { ubicacion?: { lat: number; lng: number } }>(items: T[], from: LatLng): T[]` — ítems con `ubicacion` ordenados ascendente por distancia; ítems sin `ubicacion` al final, en orden original.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/telegram/__tests__/geo.test.ts
import { describe, it, expect } from "vitest";
import { haversineKm, sortByDistance } from "@/telegram/geo";

describe("haversineKm", () => {
  it("computa una distancia conocida (Caracas–Maracay ~70-90 km)", () => {
    const caracas = { lat: 10.4806, lng: -66.9036 };
    const maracay = { lat: 10.2469, lng: -67.5958 };
    const d = haversineKm(caracas, maracay);
    expect(d).toBeGreaterThan(70);
    expect(d).toBeLessThan(90);
  });

  it("distancia a sí mismo es 0", () => {
    const p = { lat: 10, lng: -66 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });
});

describe("sortByDistance", () => {
  it("ordena por cercanía y deja los sin-geo al final", () => {
    const from = { lat: 10, lng: -66 };
    const items = [
      { id: "lejos", ubicacion: { lat: 11, lng: -66 } },
      { id: "sin" },
      { id: "cerca", ubicacion: { lat: 10.05, lng: -66 } },
    ];
    const out = sortByDistance(items, from);
    expect(out.map((i) => i.id)).toEqual(["cerca", "lejos", "sin"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/geo.test.ts`
Expected: FAIL — no se puede importar `@/telegram/geo` (módulo inexistente).

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/telegram/geo.ts
export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371; // radio terrestre en km

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function sortByDistance<
  T extends { ubicacion?: { lat: number; lng: number } },
>(items: T[], from: LatLng): T[] {
  const withGeo: Array<{ item: T; d: number }> = [];
  const without: T[] = [];
  for (const item of items) {
    if (item.ubicacion) {
      withGeo.push({ item, d: haversineKm(from, item.ubicacion) });
    } else {
      without.push(item);
    }
  }
  withGeo.sort((a, b) => a.d - b.d);
  return [...withGeo.map((x) => x.item), ...without];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/geo.test.ts`
Expected: PASS (4 asserts).

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/geo.ts backend/src/telegram/__tests__/geo.test.ts
git commit -m "✨ feat(telegram): geo.ts con haversine y orden por cercanía"
```

---

### Task 2: API de Telegram con markup + `answerCallbackQuery`

**Files:**

- Modify: `backend/src/telegram/telegramApi.ts`
- Modify: `backend/src/telegram/types.ts` (añadir tipos de markup)
- Test: `backend/src/telegram/__tests__/telegramApi.test.ts` (añadir casos)

**Interfaces:**

- Produces (en `types.ts`):
  - `interface InlineKeyboardButton { text: string; callback_data?: string; url?: string }`
  - `interface InlineKeyboardMarkup { inline_keyboard: InlineKeyboardButton[][] }`
  - `interface KeyboardButton { text: string; request_location?: boolean }`
  - `interface ReplyKeyboardMarkup { keyboard: KeyboardButton[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean }`
  - `interface RemoveKeyboard { remove_keyboard: true }`
  - `type ReplyMarkup = InlineKeyboardMarkup | ReplyKeyboardMarkup | RemoveKeyboard`
- Produces (en `telegramApi.ts`):
  - `sendMessage(token: string, chatId: number, text: string, opts?: { replyMarkup?: ReplyMarkup; fetch?: typeof fetch }): Promise<void>`
  - `answerCallbackQuery(token: string, callbackQueryId: string, opts?: { fetch?: typeof fetch }): Promise<void>`

> Nota: la firma de `sendMessage` cambia de `(...,deps?: { fetch })` a `(...,opts?: { replyMarkup?, fetch? })`. El test existente que pasa `{ fetch: fetchMock }` sigue siendo válido (ahora es `opts.fetch`). Las llamadas del handler `sendMessage(token, chatId, text)` no cambian.

- [ ] **Step 1: Write the failing tests** (añadir al describe existente)

```ts
// backend/src/telegram/__tests__/telegramApi.test.ts  (añadir estos it dentro del describe)
import {
  sendMessage,
  getMe,
  answerCallbackQuery,
} from "@/telegram/telegramApi";

it("sendMessage incluye reply_markup cuando se pasa", async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  const markup = {
    inline_keyboard: [[{ text: "Ir", callback_data: "home" }]],
  };
  await sendMessage("TOK", 7, "hola", {
    replyMarkup: markup,
    fetch: fetchMock as any,
  });
  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse((init as any).body)).toMatchObject({
    chat_id: 7,
    text: "hola",
    reply_markup: markup,
  });
});

it("sendMessage NO incluye reply_markup cuando no se pasa", async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  await sendMessage("TOK", 7, "hola", { fetch: fetchMock as any });
  expect(
    JSON.parse((fetchMock.mock.calls[0][1] as any).body),
  ).not.toHaveProperty("reply_markup");
});

it("answerCallbackQuery hace POST con callback_query_id", async () => {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  await answerCallbackQuery("TOK", "cb1", { fetch: fetchMock as any });
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toContain("/botTOK/answerCallbackQuery");
  expect(JSON.parse((init as any).body)).toMatchObject({
    callback_query_id: "cb1",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/telegramApi.test.ts`
Expected: FAIL — `answerCallbackQuery` no exportada y `sendMessage` no incluye `reply_markup`.

- [ ] **Step 3: Add the markup types in `types.ts`**

Añadir al final de `backend/src/telegram/types.ts`:

```ts
export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
export interface KeyboardButton {
  text: string;
  request_location?: boolean;
}
export interface ReplyKeyboardMarkup {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}
export interface RemoveKeyboard {
  remove_keyboard: true;
}
export type ReplyMarkup =
  | InlineKeyboardMarkup
  | ReplyKeyboardMarkup
  | RemoveKeyboard;
```

- [ ] **Step 4: Rewrite `telegramApi.ts`**

```ts
// backend/src/telegram/telegramApi.ts
import type { ReplyMarkup } from "@/telegram/types";

type FetchFn = typeof fetch;

const API = "https://api.telegram.org";

interface SendOpts {
  replyMarkup?: ReplyMarkup;
  fetch?: FetchFn;
}

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  opts?: SendOpts,
): Promise<void> {
  const f = opts?.fetch ?? fetch;
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts?.replyMarkup) body.reply_markup = opts.replyMarkup;
  const res = await f(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  opts?: { fetch?: FetchFn },
): Promise<void> {
  const f = opts?.fetch ?? fetch;
  const res = await f(`${API}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
  if (!res.ok) throw new Error(`answerCallbackQuery failed: ${res.status}`);
}

export async function getMe(
  token: string,
  deps?: { fetch?: FetchFn },
): Promise<{ username: string }> {
  const f = deps?.fetch ?? fetch;
  const res = await f(`${API}/bot${token}/getMe`);
  const data = (await res.json()) as { result?: { username?: string } };
  return { username: data.result?.username ?? "" };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/telegramApi.test.ts`
Expected: PASS (los 2 originales + 3 nuevos).

- [ ] **Step 6: Commit**

```bash
git add backend/src/telegram/telegramApi.ts backend/src/telegram/types.ts backend/src/telegram/__tests__/telegramApi.test.ts
git commit -m "✨ feat(telegram): sendMessage con reply_markup y answerCallbackQuery"
```

---

### Task 3: Información de emergencias (`emergencyInfo.ts`)

**Files:**

- Create: `backend/src/telegram/emergencyInfo.ts`
- Test: `backend/src/telegram/__tests__/emergencyInfo.test.ts`

**Interfaces:**

- Consumes: `InlineKeyboardMarkup` de `@/telegram/types`.
- Produces:
  - `interface EmergencyContact { label: string; phone: string }`
  - `const EMERGENCY_CONTACTS: EmergencyContact[]`
  - `interface MonitoringLink { label: string; url: string }`
  - `const MONITORING_LINKS: MonitoringLink[]`
  - `renderEmergency(): { text: string; replyMarkup: InlineKeyboardMarkup }` — el último botón inline es siempre `⬅️ Volver` con `callback_data: "ayuda"`.

> No importa `MenuResponse` (evita import circular con `menu.ts`); devuelve un objeto estructuralmente compatible.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/telegram/__tests__/emergencyInfo.test.ts
import { describe, it, expect } from "vitest";
import { EMERGENCY_CONTACTS, renderEmergency } from "@/telegram/emergencyInfo";

describe("renderEmergency", () => {
  it("incluye el 911 y un botón de Volver hacia 'ayuda'", () => {
    const r = renderEmergency();
    expect(r.text).toContain("911");
    const flat = r.replyMarkup.inline_keyboard.flat();
    expect(flat.some((b) => b.callback_data === "ayuda")).toBe(true);
  });

  it("todos los teléfonos son cadenas no vacías", () => {
    for (const c of EMERGENCY_CONTACTS) {
      expect(c.phone.trim().length).toBeGreaterThan(0);
    }
  });

  it("avisa que el monitoreo está en actualización si no hay enlaces", () => {
    const r = renderEmergency();
    // Con MONITORING_LINKS vacío (placeholder), debe avisar.
    if (
      r.replyMarkup.inline_keyboard.flat().filter((b) => b.url).length === 0
    ) {
      expect(r.text.toLowerCase()).toContain("actualización");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/emergencyInfo.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write implementation**

```ts
// backend/src/telegram/emergencyInfo.ts
import type { InlineKeyboardMarkup } from "@/telegram/types";

export interface EmergencyContact {
  label: string;
  phone: string;
}

// TODO(dueño): confirmar números oficiales vigentes en Venezuela
// (Bomberos, Cruz Roja Venezolana, Protección Civil / PCNGRD) y añadirlos aquí
// en formato internacional (+58...) para que Telegram los haga "tap para llamar".
export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { label: "Emergencias (nacional)", phone: "911" },
];

export interface MonitoringLink {
  label: string;
  url: string;
}

// TODO(dueño): cuentas/páginas de X de monitoreo oficial de rescates en
// tiempo real (p.ej. Protección Civil, Cruz Roja). Deben ser URLs https.
export const MONITORING_LINKS: MonitoringLink[] = [];

export function renderEmergency(): {
  text: string;
  replyMarkup: InlineKeyboardMarkup;
} {
  const lines = [
    "🚑 Emergencias médicas y rescate",
    "",
    "Números oficiales (toca el número para llamar):",
    ...EMERGENCY_CONTACTS.map((c) => `• ${c.label}: ${c.phone}`),
  ];
  if (MONITORING_LINKS.length === 0) {
    lines.push(
      "",
      "ℹ️ La lista de monitoreo en tiempo real está en actualización.",
    );
  }
  const inline_keyboard = [
    ...MONITORING_LINKS.map((l) => [{ text: `📡 ${l.label}`, url: l.url }]),
    [{ text: "⬅️ Volver", callback_data: "ayuda" }],
  ];
  return { text: lines.join("\n"), replyMarkup: { inline_keyboard } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/emergencyInfo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/emergencyInfo.ts backend/src/telegram/__tests__/emergencyInfo.test.ts
git commit -m "✨ feat(telegram): emergencyInfo con números oficiales (placeholders) y monitoreo"
```

---

### Task 4: Tarjetas de resultados (`cards.ts`)

**Files:**

- Create: `backend/src/telegram/cards.ts`
- Test: `backend/src/telegram/__tests__/cards.test.ts`

**Interfaces:**

- Consumes: `haversineKm`, `LatLng` de `@/telegram/geo`; `InlineKeyboardButton`, `PublicItem` de `@/telegram/types`.
- Produces:
  - `mapsUrl(loc: { lat: number; lng: number }): string`
  - `interface RenderedList { text: string; buttons: InlineKeyboardButton[][] }`
  - `renderList(items: PublicItem[], userLoc?: LatLng): RenderedList` — un bloque de texto por ítem; un botón `url` "📍 Cómo llegar" por cada ítem que tenga `ubicacion`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/telegram/__tests__/cards.test.ts
import { describe, it, expect } from "vitest";
import { mapsUrl, renderList } from "@/telegram/cards";
import type { PublicItem } from "@/telegram/types";

const conGeo: PublicItem = {
  category: "acopios",
  sourceId: "s",
  externalId: "1",
  titulo: "Albergue San Manuel",
  texto: "Aceptan mascotas. Traer identificación.",
  ubicacion: { lat: 10.5, lng: -66.9, nombre: "Chacao" },
  trust: "verificado",
};
const sinGeo: PublicItem = {
  category: "acopios",
  sourceId: "s",
  externalId: "2",
  titulo: "Punto sin ubicación",
  texto: "Sin coordenadas",
  trust: "no_verificado",
};

describe("mapsUrl", () => {
  it("construye URL de Google Maps con lat,lng", () => {
    expect(mapsUrl({ lat: 10.5, lng: -66.9 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=10.5,-66.9",
    );
  });
});

describe("renderList", () => {
  it("añade botón 'Cómo llegar' solo para ítems con ubicación", () => {
    const { buttons } = renderList([conGeo, sinGeo]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0][0].url).toContain("query=10.5,-66.9");
  });

  it("muestra insignia de trust y nombre de ubicación", () => {
    const { text } = renderList([conGeo]);
    expect(text).toContain("Albergue San Manuel");
    expect(text).toContain("✅");
    expect(text).toContain("Chacao");
  });

  it("muestra distancia aproximada cuando hay ubicación del usuario", () => {
    const { text } = renderList([conGeo], { lat: 10.5, lng: -66.9 });
    expect(text).toMatch(/km/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/cards.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write implementation**

```ts
// backend/src/telegram/cards.ts
import { haversineKm, type LatLng } from "@/telegram/geo";
import type { InlineKeyboardButton, PublicItem } from "@/telegram/types";

const TRUST_BADGE: Record<string, string> = {
  verificado: "✅ verificado",
  corroborado: "🟢 corroborado",
  no_verificado: "⚪ sin verificar",
};

function excerpt(s: string, n = 160): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function mapsUrl(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}

export interface RenderedList {
  text: string;
  buttons: InlineKeyboardButton[][];
}

export function renderList(
  items: PublicItem[],
  userLoc?: LatLng,
): RenderedList {
  const blocks: string[] = [];
  const buttons: InlineKeyboardButton[][] = [];
  items.forEach((it, i) => {
    const badge = TRUST_BADGE[it.trust ?? "no_verificado"] ?? "";
    const parts = [`${i + 1}. ${it.titulo}${badge ? `  ·  ${badge}` : ""}`];
    const ex = excerpt(it.texto);
    if (ex) parts.push(ex);
    if (it.ubicacion) {
      if (it.ubicacion.nombre) parts.push(`📍 ${it.ubicacion.nombre}`);
      if (userLoc) {
        const km = haversineKm(userLoc, it.ubicacion);
        parts.push(`📏 a ~${km < 1 ? "<1" : Math.round(km)} km`);
      }
      buttons.push([
        {
          text: `📍 Cómo llegar — ${excerpt(it.titulo, 24)}`,
          url: mapsUrl(it.ubicacion),
        },
      ]);
    }
    blocks.push(parts.join("\n"));
  });
  return { text: blocks.join("\n\n"), buttons };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/cards.ts backend/src/telegram/__tests__/cards.test.ts
git commit -m "✨ feat(telegram): cards.ts renderiza tarjetas con insignia, distancia y enlace a Maps"
```

---

### Task 5: Árbol del menú (`menu.ts`)

**Files:**

- Create: `backend/src/telegram/menu.ts`
- Test: `backend/src/telegram/__tests__/menu.test.ts`

**Interfaces:**

- Consumes: `normalize` de `@/telegram/retrieval`; `sortByDistance`, `LatLng` de `@/telegram/geo`; `renderList` de `@/telegram/cards`; `renderEmergency` de `@/telegram/emergencyInfo`; `InlineKeyboardMarkup`, `PublicItem`, `ReplyMarkup`, `Snapshot` de `@/telegram/types`.
- Produces:
  - `interface MenuResponse { text: string; replyMarkup?: ReplyMarkup }`
  - `const SKIP_LOCATION_TEXT = "Ver sin ubicación"`
  - `const LOCATION_ACTIONS: Set<string>` (`insumos`, `voluntariado`, `refugios`, `viveres`)
  - `homeScreen(): MenuResponse`
  - `navScreen(action: string): MenuResponse | null` (`home`/`ayuda`/`emergencias`/`animales`; `null` si no es de navegación)
  - `selectItems(action: string, snap: Snapshot): PublicItem[]`
  - `categoryScreen(action: string, snap: Snapshot, userLoc?: LatLng): MenuResponse`
  - `locationPrompt(action: string): MenuResponse`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/telegram/__tests__/menu.test.ts
import { describe, it, expect } from "vitest";
import {
  categoryScreen,
  homeScreen,
  locationPrompt,
  navScreen,
  selectItems,
  LOCATION_ACTIONS,
} from "@/telegram/menu";
import type { PublicItem, Snapshot } from "@/telegram/types";

function item(p: Partial<PublicItem>): PublicItem {
  return {
    category: "acopios",
    sourceId: "s",
    externalId: Math.random().toString(36).slice(2),
    titulo: "x",
    texto: "y",
    ...p,
  };
}

const snap: Snapshot = {
  generatedAt: "t",
  categories: {
    acopios: [
      item({ titulo: "Albergue Central", texto: "camas disponibles" }),
      item({
        titulo: "Punto de agua potable",
        texto: "reparten agua y comida",
      }),
      item({ titulo: "Recolecta de ropa", texto: "donaciones de insumos" }),
    ],
    solicitudes: [
      item({ category: "solicitudes", titulo: "Hospital pide voluntarios" }),
    ],
  },
};

describe("homeScreen", () => {
  it("ofrece insumos, voluntariado y NECESITO AYUDA", () => {
    const flat = (homeScreen().replyMarkup as any).inline_keyboard.flat();
    const datas = flat.map((b: any) => b.callback_data);
    expect(datas).toEqual(
      expect.arrayContaining(["insumos", "voluntariado", "ayuda"]),
    );
  });
});

describe("navScreen", () => {
  it("'animales' devuelve mensaje de próximamente", () => {
    const r = navScreen("animales")!;
    expect(r.text.toLowerCase()).toContain("próximamente");
  });
  it("'ayuda' ofrece los 4 sub-botones", () => {
    const flat = (
      navScreen("ayuda")!.replyMarkup as any
    ).inline_keyboard.flat();
    const datas = flat.map((b: any) => b.callback_data);
    expect(datas).toEqual(
      expect.arrayContaining([
        "emergencias",
        "refugios",
        "viveres",
        "animales",
      ]),
    );
  });
  it("devuelve null para acciones de categoría", () => {
    expect(navScreen("refugios")).toBeNull();
  });
});

describe("selectItems (sub-filtro de acopios)", () => {
  it("refugios captura albergue y NO el resto", () => {
    const titulos = selectItems("refugios", snap).map((i) => i.titulo);
    expect(titulos).toContain("Albergue Central");
    expect(titulos).not.toContain("Recolecta de ropa");
  });
  it("viveres captura agua/comida", () => {
    const titulos = selectItems("viveres", snap).map((i) => i.titulo);
    expect(titulos).toContain("Punto de agua potable");
  });
  it("insumos excluye albergues", () => {
    const titulos = selectItems("insumos", snap).map((i) => i.titulo);
    expect(titulos).toContain("Recolecta de ropa");
    expect(titulos).not.toContain("Albergue Central");
  });
  it("voluntariado lee de solicitudes", () => {
    const titulos = selectItems("voluntariado", snap).map((i) => i.titulo);
    expect(titulos).toContain("Hospital pide voluntarios");
  });
});

describe("categoryScreen", () => {
  it("muestra mensaje vacío cuando no hay ítems", () => {
    const empty: Snapshot = { generatedAt: "t", categories: {} };
    const r = categoryScreen("refugios", empty);
    expect(r.text.toLowerCase()).toContain("no hay registros");
  });
  it("incluye un botón Volver", () => {
    const flat = (
      categoryScreen("refugios", snap).replyMarkup as any
    ).inline_keyboard.flat();
    expect(flat.some((b: any) => b.text.includes("Volver"))).toBe(true);
  });
});

describe("locationPrompt / LOCATION_ACTIONS", () => {
  it("las acciones de categoría requieren ubicación", () => {
    expect([...LOCATION_ACTIONS].sort()).toEqual([
      "insumos",
      "refugios",
      "viveres",
      "voluntariado",
    ]);
  });
  it("ofrece teclado con request_location y opción de saltar", () => {
    const mk = locationPrompt("refugios").replyMarkup as any;
    const flat = mk.keyboard.flat();
    expect(flat.some((b: any) => b.request_location === true)).toBe(true);
    expect(flat.some((b: any) => b.text === "Ver sin ubicación")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/menu.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write implementation**

```ts
// backend/src/telegram/menu.ts
import { normalize } from "@/telegram/retrieval";
import { sortByDistance, type LatLng } from "@/telegram/geo";
import { renderList } from "@/telegram/cards";
import { renderEmergency } from "@/telegram/emergencyInfo";
import type {
  InlineKeyboardMarkup,
  PublicItem,
  ReplyMarkup,
  Snapshot,
} from "@/telegram/types";

export interface MenuResponse {
  text: string;
  replyMarkup?: ReplyMarkup;
}

export const SKIP_LOCATION_TEXT = "Ver sin ubicación";
const MAX_ITEMS = 8;

export const LOCATION_ACTIONS = new Set([
  "insumos",
  "voluntariado",
  "refugios",
  "viveres",
]);

const REFUGIO_RE = /refugio|albergue|alberg/;
const VIVERES_RE =
  /agua|comida|aliment|viver|despensa|enlatad|formula|leche|potable/;

function blob(it: PublicItem): string {
  return normalize(`${it.titulo} ${it.texto}`);
}

function notSuspect(it: PublicItem): boolean {
  return it.trust !== "sospechoso";
}

export function selectItems(action: string, snap: Snapshot): PublicItem[] {
  const acopios = (snap.categories.acopios ?? []).filter(notSuspect);
  switch (action) {
    case "insumos":
      return acopios.filter((it) => !REFUGIO_RE.test(blob(it)));
    case "refugios":
      return acopios.filter((it) => REFUGIO_RE.test(blob(it)));
    case "viveres":
      return acopios.filter((it) => VIVERES_RE.test(blob(it)));
    case "voluntariado":
      return (snap.categories.solicitudes ?? []).filter(notSuspect);
    default:
      return [];
  }
}

const TRUST_RANK: Record<string, number> = {
  verificado: 0,
  corroborado: 1,
  no_verificado: 2,
};
function byTrust(a: PublicItem, b: PublicItem): number {
  return (
    (TRUST_RANK[a.trust ?? "no_verificado"] ?? 2) -
    (TRUST_RANK[b.trust ?? "no_verificado"] ?? 2)
  );
}

const TITLES: Record<string, string> = {
  insumos: "📦 Centros de acopio para aportar insumos",
  voluntariado: "🙋 Dónde se necesita voluntariado",
  refugios: "🏠 Refugios y albergues",
  viveres: "💧 Puntos de distribución de víveres",
};
const BACK_TARGET: Record<string, string> = {
  insumos: "home",
  voluntariado: "home",
  refugios: "ayuda",
  viveres: "ayuda",
};

function backRow(target: string) {
  return [{ text: "⬅️ Volver", callback_data: target }];
}
function backMarkup(target: string): InlineKeyboardMarkup {
  return { inline_keyboard: [backRow(target)] };
}

export function homeScreen(): MenuResponse {
  return {
    text: [
      "👋 ¡Hola! Soy el asistente de VenezuelaHelp.",
      "",
      "Reúno información pública sobre el terremoto de Venezuela (25 de junio de 2026). Usa los botones para encontrar ayuda, o escríbeme tu pregunta en lenguaje natural.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "📦 Aportar insumos", callback_data: "insumos" },
          { text: "🙋 Voluntariado", callback_data: "voluntariado" },
        ],
        [{ text: "🚨 NECESITO AYUDA", callback_data: "ayuda" }],
      ],
    },
  };
}

function helpScreen(): MenuResponse {
  return {
    text: "🚨 NECESITO AYUDA\n\nElige una opción:",
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: "🚑 Emergencias médicas y rescate",
            callback_data: "emergencias",
          },
        ],
        [{ text: "🏠 Refugios y albergues", callback_data: "refugios" }],
        [{ text: "💧 Distribución de víveres", callback_data: "viveres" }],
        [{ text: "🐾 Rescate y refugios animales", callback_data: "animales" }],
        [{ text: "⬅️ Volver", callback_data: "home" }],
      ],
    },
  };
}

function animalsScreen(): MenuResponse {
  return {
    text: [
      "🐾 Rescate y refugios animales",
      "",
      "Esta sección estará disponible próximamente. Por ahora no tenemos información verificada de refugios o veterinarias para animales.",
    ].join("\n"),
    replyMarkup: backMarkup("ayuda"),
  };
}

export function navScreen(action: string): MenuResponse | null {
  switch (action) {
    case "home":
      return homeScreen();
    case "ayuda":
      return helpScreen();
    case "emergencias":
      return renderEmergency();
    case "animales":
      return animalsScreen();
    default:
      return null;
  }
}

export function categoryScreen(
  action: string,
  snap: Snapshot,
  userLoc?: LatLng,
): MenuResponse {
  const selected = selectItems(action, snap);
  const ordered = userLoc
    ? sortByDistance(selected, userLoc)
    : [...selected].sort(byTrust);
  const items = ordered.slice(0, MAX_ITEMS);
  const title = TITLES[action] ?? "Resultados";
  const back = BACK_TARGET[action] ?? "home";
  if (items.length === 0) {
    return {
      text: `${title}\n\nNo hay registros disponibles ahora mismo. Intenta más tarde 🙏`,
      replyMarkup: backMarkup(back),
    };
  }
  const { text, buttons } = renderList(items, userLoc);
  return {
    text: `${title}\n\n${text}`,
    replyMarkup: { inline_keyboard: [...buttons, backRow(back)] },
  };
}

export function locationPrompt(action: string): MenuResponse {
  const title = TITLES[action] ?? "Resultados";
  return {
    text: `${title}\n\n📍 Comparte tu ubicación para ordenar por cercanía, o continúa sin ella.`,
    replyMarkup: {
      keyboard: [
        [{ text: "📍 Compartir ubicación", request_location: true }],
        [{ text: SKIP_LOCATION_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/menu.ts backend/src/telegram/__tests__/menu.test.ts
git commit -m "✨ feat(telegram): menu.ts con pantallas, sub-filtro de acopios y prompt de ubicación"
```

---

### Task 6: Estado del menú por chat (`menuState.ts`)

**Files:**

- Create: `backend/src/telegram/menuState.ts`
- Test: `backend/src/telegram/__tests__/menuState.test.ts`

**Interfaces:**

- Consumes: `ddb`, `TABLE_NAME` de `@/shared/ddb`; `TGUSER_PK` de `@/shared/keys`; `GetCommand`, `UpdateCommand` de `@aws-sdk/lib-dynamodb`.
- Produces:
  - `interface MenuState { pendingCategory?: string; lastLat?: number; lastLng?: number; lastLocationAt?: string }`
  - `class MenuStateRepo` con:
    - `get(chatId: number): Promise<MenuState>`
    - `setPending(chatId: number, category: string): Promise<void>`
    - `setLocation(chatId: number, lat: number, lng: number, now: string): Promise<void>` — también limpia `pendingCategory`.
    - `clearPending(chatId: number): Promise<void>`

> Reusa el ítem existente del usuario (`PK=TGUSER`, `SK=<chatId>`), añadiendo campos. No crea otra entidad.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/telegram/__tests__/menuState.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { MenuStateRepo } from "@/telegram/menuState";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

describe("MenuStateRepo", () => {
  it("get devuelve el estado del ítem del usuario", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        PK: "TGUSER",
        SK: "5",
        pendingCategory: "refugios",
        lastLat: 10,
        lastLng: -66,
        lastLocationAt: "2026-06-26T00:00:00Z",
      },
    });
    const s = await new MenuStateRepo().get(5);
    expect(s).toEqual({
      pendingCategory: "refugios",
      lastLat: 10,
      lastLng: -66,
      lastLocationAt: "2026-06-26T00:00:00Z",
    });
    const input = ddbMock.commandCalls(GetCommand)[0].args[0].input as any;
    expect(input.Key).toEqual({ PK: "TGUSER", SK: "5" });
  });

  it("get devuelve objeto vacío si el ítem no existe", async () => {
    ddbMock.on(GetCommand).resolves({});
    expect(await new MenuStateRepo().get(9)).toEqual({});
  });

  it("setPending escribe pendingCategory", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await new MenuStateRepo().setPending(5, "viveres");
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input as any;
    expect(input.Key).toEqual({ PK: "TGUSER", SK: "5" });
    expect(input.UpdateExpression).toContain("pendingCategory");
    expect(input.ExpressionAttributeValues[":c"]).toBe("viveres");
  });

  it("setLocation guarda coords y limpia pendingCategory", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await new MenuStateRepo().setLocation(
      5,
      10.5,
      -66.9,
      "2026-06-26T01:00:00Z",
    );
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input as any;
    expect(input.UpdateExpression).toContain("REMOVE pendingCategory");
    expect(input.ExpressionAttributeValues[":la"]).toBe(10.5);
    expect(input.ExpressionAttributeValues[":ln"]).toBe(-66.9);
  });

  it("clearPending hace REMOVE", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await new MenuStateRepo().clearPending(5);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input as any;
    expect(input.UpdateExpression).toContain("REMOVE pendingCategory");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/menuState.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write implementation**

```ts
// backend/src/telegram/menuState.ts
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "@/shared/ddb";
import { TGUSER_PK } from "@/shared/keys";

export interface MenuState {
  pendingCategory?: string;
  lastLat?: number;
  lastLng?: number;
  lastLocationAt?: string;
}

function key(chatId: number) {
  return { PK: TGUSER_PK, SK: String(chatId) };
}

export class MenuStateRepo {
  async get(chatId: number): Promise<MenuState> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: key(chatId) }),
    );
    const it = (res.Item ?? {}) as Record<string, unknown>;
    const out: MenuState = {};
    if (typeof it.pendingCategory === "string")
      out.pendingCategory = it.pendingCategory;
    if (typeof it.lastLat === "number") out.lastLat = it.lastLat;
    if (typeof it.lastLng === "number") out.lastLng = it.lastLng;
    if (typeof it.lastLocationAt === "string")
      out.lastLocationAt = it.lastLocationAt;
    return out;
  }

  async setPending(chatId: number, category: string): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key(chatId),
        UpdateExpression: "SET pendingCategory = :c",
        ExpressionAttributeValues: { ":c": category },
      }),
    );
  }

  async setLocation(
    chatId: number,
    lat: number,
    lng: number,
    now: string,
  ): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key(chatId),
        UpdateExpression:
          "SET lastLat = :la, lastLng = :ln, lastLocationAt = :ts REMOVE pendingCategory",
        ExpressionAttributeValues: { ":la": lat, ":ln": lng, ":ts": now },
      }),
    );
  }

  async clearPending(chatId: number): Promise<void> {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key(chatId),
        UpdateExpression: "REMOVE pendingCategory",
      }),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/menuState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram/menuState.ts backend/src/telegram/__tests__/menuState.test.ts
git commit -m "✨ feat(telegram): MenuStateRepo persiste categoría pendiente y última ubicación"
```

---

### Task 7: Cableado en el handler (+ tipos de update + `trigger.ts`)

**Files:**

- Modify: `backend/src/telegram/types.ts` (añadir `location`, `callback_query`)
- Modify: `backend/src/telegram/trigger.ts` (añadir `isMenuCommand`)
- Modify: `backend/src/telegram/handler.ts` (ramas nuevas + deps)
- Test: `backend/src/telegram/__tests__/handler.test.ts` (añadir casos)
- Test: `backend/src/telegram/__tests__/trigger.test.ts` (añadir caso)

**Interfaces:**

- Consumes: todo lo anterior (`navScreen`, `homeScreen`, `categoryScreen`, `locationPrompt`, `selectItems`, `LOCATION_ACTIONS`, `SKIP_LOCATION_TEXT` de `@/telegram/menu`; `MenuStateRepo`, `MenuState` de `@/telegram/menuState`; `answerCallbackQuery` de `@/telegram/telegramApi`).
- Produces (en `types.ts`):
  - `interface TgLocation { latitude: number; longitude: number }`
  - `TgMessage` gana `location?: TgLocation`
  - `interface TgCallbackQuery { id: string; from?: TgUser; message?: { message_id: number; chat: { id: number; type: string } }; data?: string }`
  - `TgUpdate` gana `callback_query?: TgCallbackQuery`
- Produces (en `trigger.ts`): `isMenuCommand(msg: TgMessage): boolean`

- [ ] **Step 1: Write the failing tests**

`trigger.test.ts` (añadir):

```ts
// añadir import de isMenuCommand y este describe
import { isMenuCommand } from "@/telegram/trigger";

describe("isMenuCommand", () => {
  it("reconoce /menu, menu y menú", () => {
    const m = (text: string) =>
      ({ message_id: 1, text, chat: { id: 1, type: "private" } }) as any;
    expect(isMenuCommand(m("/menu"))).toBe(true);
    expect(isMenuCommand(m("menú"))).toBe(true);
    expect(isMenuCommand(m("hola"))).toBe(false);
  });
});
```

`handler.test.ts` (añadir al `deps()` los nuevos campos y nuevos `it`):

```ts
// 1) En la función deps(), añadir estas dos entradas al objeto retornado:
//      answerCallbackQuery: vi.fn(async () => {}),
//      menuState: {
//        get: vi.fn(async () => ({})),
//        setPending: vi.fn(async () => {}),
//        setLocation: vi.fn(async () => {}),
//        clearPending: vi.fn(async () => {}),
//      },
//
// 2) Añadir estos casos (usar chat privado para no depender de menciones):

function callbackEvent(data: string, chatId = 9) {
  return {
    body: JSON.stringify({
      callback_query: {
        id: "cb1",
        from: { id: 2, username: "ana" },
        message: { message_id: 1, chat: { id: chatId, type: "private" } },
        data,
      },
    }),
  };
}

function locationEvent(lat: number, lng: number, chatId = 9) {
  return {
    body: JSON.stringify({
      message: {
        message_id: 1,
        chat: { id: chatId, type: "private" },
        from: { id: 2, username: "ana" },
        location: { latitude: lat, longitude: lng },
      },
    }),
  };
}

it("callback 'home' responde con teclado inline y SIEMPRE answerCallbackQuery", async () => {
  const d = deps();
  await handler(callbackEvent("home"), d as any);
  expect(d.sendMessage).toHaveBeenCalledTimes(1);
  const opts = (d.sendMessage as any).mock.calls[0][3];
  expect(opts.replyMarkup.inline_keyboard).toBeTruthy();
  expect(d.answerCallbackQuery).toHaveBeenCalledWith("TOK", "cb1");
  expect(d.askBedrock).not.toHaveBeenCalled();
});

it("callback de categoría sin ubicación fresca pide ubicación y guarda pending", async () => {
  const d = deps();
  await handler(callbackEvent("refugios"), d as any);
  expect(d.menuState.setPending).toHaveBeenCalledWith(9, "refugios");
  const opts = (d.sendMessage as any).mock.calls[0][3];
  expect(opts.replyMarkup.keyboard).toBeTruthy(); // reply keyboard con request_location
});

it("callback de categoría con ubicación fresca renderiza directo", async () => {
  const d = deps({
    menuState: {
      get: vi.fn(async () => ({
        lastLat: 10,
        lastLng: -66,
        lastLocationAt: new Date().toISOString(),
      })),
      setPending: vi.fn(async () => {}),
      setLocation: vi.fn(async () => {}),
      clearPending: vi.fn(async () => {}),
    },
  });
  await handler(callbackEvent("refugios"), d as any);
  expect(d.menuState.setPending).not.toHaveBeenCalled();
  const opts = (d.sendMessage as any).mock.calls[0][3];
  expect(opts.replyMarkup.inline_keyboard).toBeTruthy();
});

it("mensaje de ubicación renderiza la categoría pendiente y persiste la ubicación", async () => {
  const d = deps({
    menuState: {
      get: vi.fn(async () => ({ pendingCategory: "refugios" })),
      setPending: vi.fn(async () => {}),
      setLocation: vi.fn(async () => {}),
      clearPending: vi.fn(async () => {}),
    },
  });
  await handler(locationEvent(10.5, -66.9), d as any);
  expect(d.menuState.setLocation).toHaveBeenCalledWith(
    9,
    10.5,
    -66.9,
    expect.any(String),
  );
  expect(d.sendMessage).toHaveBeenCalled();
  expect(d.askBedrock).not.toHaveBeenCalled();
});

it("una pregunta libre SIGUE yendo a RAG+Bedrock (regresión)", async () => {
  const d = deps();
  await handler(
    event("dónde hay agua", { chat: { id: 9, type: "private" } }),
    d as any,
  );
  expect(d.askBedrock).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts src/telegram/__tests__/trigger.test.ts`
Expected: FAIL — `isMenuCommand` no existe; el handler no maneja `callback_query` ni `location`; `answerCallbackQuery`/`menuState` no se usan.

- [ ] **Step 3: Extend `types.ts`**

Añadir al final de `backend/src/telegram/types.ts`:

```ts
export interface TgLocation {
  latitude: number;
  longitude: number;
}

export interface TgCallbackQuery {
  id: string;
  from?: TgUser;
  message?: { message_id: number; chat: { id: number; type: string } };
  data?: string;
}
```

Y modificar las interfaces existentes:

```ts
// en TgMessage, añadir:
  location?: TgLocation;

// en TgUpdate, añadir:
  callback_query?: TgCallbackQuery;
```

- [ ] **Step 4: Extend `trigger.ts`**

Añadir a `backend/src/telegram/trigger.ts`:

```ts
const MENU = /^\/?(menu|menú)$/i;

export function isMenuCommand(msg: TgMessage): boolean {
  return MENU.test((msg.text ?? "").trim());
}
```

- [ ] **Step 5: Rewrite `handler.ts`**

```ts
// backend/src/telegram/handler.ts
import { ConfigRepo } from "@/shared/repos/configRepo";
import { QaLogRepo } from "@/shared/repos/qaLogRepo";
import { RateLimitRepo } from "@/shared/repos/rateLimitRepo";
import { TgUserRepo } from "@/shared/repos/tgUserRepo";
import { logger } from "@/shared/logger";
import { getTelegramToken, getWebhookSecret } from "@/telegram/secret";
import {
  getMe,
  sendMessage as realSend,
  answerCallbackQuery as realAnswer,
} from "@/telegram/telegramApi";
import { loadSnapshot as realLoad } from "@/telegram/snapshot";
import { askBedrock as realAsk } from "@/telegram/bedrock";
import { retrieve } from "@/telegram/retrieval";
import { buildUserText } from "@/telegram/prompt";
import {
  shouldRespond,
  extractQuestion,
  isStartCommand,
  isMenuCommand,
} from "@/telegram/trigger";
import {
  categoryScreen,
  homeScreen,
  locationPrompt,
  navScreen,
  LOCATION_ACTIONS,
  SKIP_LOCATION_TEXT,
} from "@/telegram/menu";
import { MenuStateRepo, type MenuState } from "@/telegram/menuState";
import type { LatLng } from "@/telegram/geo";
import type { TgCallbackQuery, TgMessage, TgUpdate } from "@/telegram/types";

const FALLBACK =
  "Disculpa, estoy con mucha demanda ahora mismo. Intenta de nuevo en un momento.";
const NO_DATA =
  "No tengo ese dato en la información del terremoto que tengo disponible.";
const RATE_LIMITED =
  "Estás enviando preguntas muy rápido. Espera un momento y vuelve a intentar. 🙏";

const FRESH_MS = 60 * 60 * 1000;

let botUsernameCache: string | null = null;

interface Deps {
  getToken: typeof getTelegramToken;
  getWebhookSecret: typeof getWebhookSecret;
  getBotUsername: (token: string) => Promise<string>;
  configRepo: Pick<ConfigRepo, "get">;
  qaLogRepo: Pick<QaLogRepo, "append">;
  rateLimit: Pick<RateLimitRepo, "hit">;
  tgUserRepo: Pick<TgUserRepo, "upsert">;
  menuState: Pick<
    MenuStateRepo,
    "get" | "setPending" | "setLocation" | "clearPending"
  >;
  loadSnapshot: typeof realLoad;
  askBedrock: typeof realAsk;
  sendMessage: typeof realSend;
  answerCallbackQuery: typeof realAnswer;
}

async function defaultBotUsername(token: string): Promise<string> {
  if (botUsernameCache) return botUsernameCache;
  botUsernameCache = (await getMe(token)).username;
  return botUsernameCache;
}

function freshLoc(state: MenuState, now: number): LatLng | undefined {
  if (state.lastLat == null || state.lastLng == null || !state.lastLocationAt)
    return undefined;
  if (now - Date.parse(state.lastLocationAt) > FRESH_MS) return undefined;
  return { lat: state.lastLat, lng: state.lastLng };
}

// Lectura de estado tolerante a fallos de DynamoDB: degradar, no romper.
async function safeGetState(d: Deps, chatId: number): Promise<MenuState> {
  try {
    return await d.menuState.get(chatId);
  } catch (e) {
    logger.warn("no se pudo leer el estado del menú", {
      chatId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {};
  }
}

export async function handler(
  event: { body?: string; headers?: Record<string, string | undefined> },
  deps?: Partial<Deps>,
): Promise<{ statusCode: number; body: string }> {
  const d: Deps = {
    getToken: deps?.getToken ?? getTelegramToken,
    getWebhookSecret: deps?.getWebhookSecret ?? getWebhookSecret,
    getBotUsername: deps?.getBotUsername ?? defaultBotUsername,
    configRepo: deps?.configRepo ?? new ConfigRepo(),
    qaLogRepo: deps?.qaLogRepo ?? new QaLogRepo(),
    rateLimit: deps?.rateLimit ?? new RateLimitRepo(),
    tgUserRepo: deps?.tgUserRepo ?? new TgUserRepo(),
    menuState: deps?.menuState ?? new MenuStateRepo(),
    loadSnapshot: deps?.loadSnapshot ?? realLoad,
    askBedrock: deps?.askBedrock ?? realAsk,
    sendMessage: deps?.sendMessage ?? realSend,
    answerCallbackQuery: deps?.answerCallbackQuery ?? realAnswer,
  };

  let chatId: number | undefined;
  let token: string | undefined;
  try {
    const update = JSON.parse(event.body ?? "{}") as TgUpdate;

    // Verificación del secret: aplica a TODOS los updates (callback incluido).
    const expectedSecret = await d.getWebhookSecret();
    if (expectedSecret) {
      const got = event.headers?.["x-telegram-bot-api-secret-token"];
      if (got !== expectedSecret) {
        logger.warn("telegram webhook secret mismatch");
        return ok();
      }
    } else if (process.env.TELEGRAM_REQUIRE_SECRET === "true") {
      logger.error("telegram webhook secret required but missing; rejecting");
      return ok();
    }

    token = await d.getToken();

    // --- Rama 1: pulsación de botón inline ---
    if (update.callback_query) {
      return await handleCallback(d, token, update.callback_query);
    }

    const msg = update.message;
    if (!msg) return ok();
    if (msg.from?.is_bot) return ok();
    chatId = msg.chat.id;

    // Registro de usuario (aislado: un fallo aquí no rompe la respuesta).
    try {
      await d.tgUserRepo.upsert({
        chatId: msg.chat.id,
        username: msg.from?.username,
        firstName: msg.from?.first_name,
        lastName: msg.from?.last_name,
        languageCode: msg.from?.language_code,
        now: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn("no se pudo registrar el usuario de Telegram", {
        chatId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // --- Rama 2: el usuario compartió su ubicación ---
    if (msg.location) {
      return await handleLocation(d, token, msg, chatId);
    }

    if (!msg.text) return ok();

    const botUsername = await d.getBotUsername(token);
    const config = await d.configRepo.get();
    if (!shouldRespond(msg, botUsername, config.botTriggerMode)) return ok();

    // --- Rama 3a: comandos de menú / bienvenida ---
    if (isStartCommand(msg) || isMenuCommand(msg)) {
      const home = homeScreen();
      await d.sendMessage(token, chatId, home.text, {
        replyMarkup: home.replyMarkup,
      });
      return ok();
    }

    // --- Rama 3b: "Ver sin ubicación" (botón del teclado de ubicación) ---
    if (msg.text === SKIP_LOCATION_TEXT) {
      const state = await safeGetState(d, chatId);
      try {
        await d.menuState.clearPending(chatId);
      } catch (e) {
        logger.warn("no se pudo limpiar pendingCategory", {
          chatId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      const cat = state.pendingCategory;
      if (cat && LOCATION_ACTIONS.has(cat)) {
        const snap = await d.loadSnapshot();
        const screen = categoryScreen(cat, snap, undefined);
        await d.sendMessage(token, chatId, screen.text, {
          replyMarkup: screen.replyMarkup,
        });
      } else {
        const home = homeScreen();
        await d.sendMessage(token, chatId, home.text, {
          replyMarkup: home.replyMarkup,
        });
      }
      return ok();
    }

    // --- Rama 3c: pregunta libre (RAG + Bedrock, flujo original) ---
    const rl = await d.rateLimit.hit(String(chatId));
    if (!rl.allowed) {
      logger.warn("chat rate limited", { chatId, count: rl.count });
      await d.sendMessage(token, chatId, RATE_LIMITED);
      return ok();
    }

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

async function handleCallback(
  d: Deps,
  token: string,
  cq: TgCallbackQuery,
): Promise<{ statusCode: number; body: string }> {
  const chatId = cq.message?.chat.id;
  try {
    if (chatId == null) return ok();
    const data = cq.data ?? "";
    const nav = navScreen(data);
    if (nav) {
      await d.sendMessage(token, chatId, nav.text, {
        replyMarkup: nav.replyMarkup,
      });
    } else if (LOCATION_ACTIONS.has(data)) {
      const state = await safeGetState(d, chatId);
      const loc = freshLoc(state, Date.now());
      if (loc) {
        const snap = await d.loadSnapshot();
        const screen = categoryScreen(data, snap, loc);
        await d.sendMessage(token, chatId, screen.text, {
          replyMarkup: screen.replyMarkup,
        });
      } else {
        try {
          await d.menuState.setPending(chatId, data);
        } catch (e) {
          logger.warn("no se pudo guardar pendingCategory", {
            chatId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        const prompt = locationPrompt(data);
        await d.sendMessage(token, chatId, prompt.text, {
          replyMarkup: prompt.replyMarkup,
        });
      }
    } else {
      const home = homeScreen();
      await d.sendMessage(token, chatId, home.text, {
        replyMarkup: home.replyMarkup,
      });
    }
  } catch (e) {
    logger.error("error manejando callback", {
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    try {
      await d.answerCallbackQuery(token, cq.id);
    } catch (e) {
      logger.warn("answerCallbackQuery falló", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return ok();
}

async function handleLocation(
  d: Deps,
  token: string,
  msg: TgMessage,
  chatId: number,
): Promise<{ statusCode: number; body: string }> {
  const loc = {
    lat: msg.location!.latitude,
    lng: msg.location!.longitude,
  };
  const state = await safeGetState(d, chatId);
  try {
    await d.menuState.setLocation(
      chatId,
      loc.lat,
      loc.lng,
      new Date().toISOString(),
    );
  } catch (e) {
    logger.warn("no se pudo guardar la ubicación", {
      chatId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const cat = state.pendingCategory;
  if (cat && LOCATION_ACTIONS.has(cat)) {
    const snap = await d.loadSnapshot();
    const screen = categoryScreen(cat, snap, loc);
    await d.sendMessage(token, chatId, screen.text, {
      replyMarkup: screen.replyMarkup,
    });
  } else {
    const home = homeScreen();
    await d.sendMessage(
      token,
      chatId,
      `📍 Ubicación guardada.\n\n${home.text}`,
      {
        replyMarkup: home.replyMarkup,
      },
    );
  }
  return ok();
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

> Nota sobre el `WELCOME` antiguo: el handler ya no usa la constante `WELCOME` (ahora la bienvenida la da `homeScreen()`). Elimínala si quedó sin referencias para evitar un `unused`.

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npm test --workspace @venezuelahelp/backend -- src/telegram/__tests__/handler.test.ts src/telegram/__tests__/trigger.test.ts`
Expected: PASS (incluidos los casos de regresión originales del handler).

- [ ] **Step 7: Run the full backend suite + typecheck**

Run: `npm test --workspace @venezuelahelp/backend`
Expected: PASS toda la suite.

Run: `npm run build --workspace @venezuelahelp/backend`
Expected: compila sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add backend/src/telegram/handler.ts backend/src/telegram/types.ts backend/src/telegram/trigger.ts backend/src/telegram/__tests__/handler.test.ts backend/src/telegram/__tests__/trigger.test.ts
git commit -m "✨ feat(telegram): el handler enruta menú, callbacks y ubicación junto al RAG"
```

---

## Self-Review (cobertura del spec)

| Sección del spec                                                                                                             | Tarea(s) que la implementan       |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| §2 Arquitectura: 3 ramas de update, data-only sin Bedrock                                                                    | Task 7 (handler)                  |
| §3 Módulos: menu/cards/geo/emergencyInfo/menuState                                                                           | Tasks 1,3,4,5,6                   |
| §3 Extensiones: telegramApi, types, handler                                                                                  | Tasks 2,7                         |
| §4 Pantalla 1 + submenú + mapeo de botones                                                                                   | Task 5 (`homeScreen`/`navScreen`) |
| §4 Sub-filtros de acopios (refugios/víveres/insumos)                                                                         | Task 5 (`selectItems`)            |
| §4 callback_data scheme                                                                                                      | Tasks 5,7                         |
| §4 Render de tarjetas (trust, distancia, Maps)                                                                               | Task 4                            |
| §5 Flujo de ubicación (pending + frescura 1 h + skip)                                                                        | Tasks 6,7                         |
| §6 Errores (callback desconocido→home, vacío, geo-less, degradar DynamoDB, answerCallbackQuery siempre, secret en callbacks) | Task 7                            |
| §7 Testing por módulo                                                                                                        | Tasks 1-7                         |
| §9 Placeholders de contenido del dueño                                                                                       | Task 3 (TODOs)                    |

**Decisiones explícitas frente a ambigüedad del spec:**

- "📍 Cómo llegar" se implementa como **botón inline `url`** (no enlace en texto) → sin `parse_mode`, robusto ante texto de fuentes.
- "Ver sin ubicación" es un **botón del reply-keyboard** que envía el texto `SKIP_LOCATION_TEXT` (un mensaje no puede combinar reply-keyboard con inline-keyboard); el reply-keyboard usa `one_time_keyboard` para ocultarse tras un uso.
- Frescura de ubicación: **1 hora** (constante `FRESH_MS`).
- Límite de ítems por mensaje: **8** (`MAX_ITEMS`).

**Fuera de alcance (confirmado en spec §8):** campos estructurados por ítem (teléfono/horario/capacidad/inventario), categoría de animales, validación manual del admin, números por estado, detección de región.

---

## Despliegue (tras aprobar e implementar)

No hay cambios de infraestructura: el `TelegramFn` ya recibe todos los updates por el mismo webhook (incluidos `callback_query` y `location`), tiene acceso a la tabla DynamoDB y al bucket del snapshot. Solo cambia código de la Lambda:

```bash
cd infra && npx cdk deploy VenezuelaHelpBotStack --require-approval never --profile VenezuelaHelp
```

> Verificar antes con `npx cdk diff VenezuelaHelpBotStack`: el único cambio esperado es el `S3Key` del asset de la Lambda (sin tocar IAM).

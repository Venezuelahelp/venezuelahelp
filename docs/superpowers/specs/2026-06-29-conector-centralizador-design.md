# VenezuelaHelp — Conector centralizador de fuentes — Diseño (Spec)

- **Fecha:** 2026-06-29
- **Estado:** Borrador (pendiente de aprobación)
- **Contexto:** Hay 4 fuentes con conector hardcodeado por `source.id` (`sismovenezuela`, `terremotovenezuela`, `ninosvenezuela`, `hospitalesvenezuela`) más el conector genérico `ai` (HTML→Bedrock). El admin solo puede crear fuentes `ai`, que fallan contra SPAs (todos los sitios actuales lo son). Una fuente (`terremotovenezuela`) está rota en silencio: su API cambió y devuelve el shell HTML; el `safe()` se traga el error y el admin la muestra "ok" con 0 ítems. No existe permalink por ítem aunque algunas APIs ya lo entregan (p.ej. `sismovenezuela.source_url`).

## 1. Propósito y decisiones

Centralizar la ingesta de **todas** las fuentes (catástrofe del terremoto, 25-jun-2026) de forma que:

1. El admin pueda **agregar y mantener** fuentes con API JSON **sin deploy** (declarando endpoint + mapeo de campos), no solo fuentes IA.
2. Cada ítem lleve el **link directo a su origen** (el post/registro real cuando la API lo da; si no, deep-link a la página del ítem en la fuente).
3. Las **imágenes** se capturen donde existan (hotlink, Fase 1; sin cambio de re-hospedaje aquí).
4. Los **fallos dejen de ser silenciosos**: el admin distingue "ok con 0 ítems" de "roto".
5. Se **arregle `terremotovenezuela`** (re-descubrir su API) y las **bloqueadas** (reCAPTCHA/Cloudflare) se marquen como tal, no como error eterno.

Decisiones tomadas (brainstorming 2026-06-29):

- **Alcance:** centralizador completo (piezas A–E de la propuesta).
- **Permalink:** origen real cuando la API lo entregue; si no, deep-link construido a la página del ítem; si tampoco, cae a la home de la fuente (`snapshot.sources`).
- **Sin navegador headless.** SPA/Cloudflare se resuelven descubriendo su API JSON (gratis) o con outreach al operador. Las que no se puedan, quedan marcadas "bloqueada".
- **Motor declarativo (config-driven):** un solo conector genérico `rest` parametrizado por config guardada en la `Source`. Los 4 conectores actuales se reescriben como **config** (presets en código), no como `.ts` por sitio. Se conservan los conectores a mano solo si una fuente es demasiado irregular para el motor.
- **Compatibilidad:** la clave estable de dedup (`CAT#<cat>/<sourceId>#<externalId>`), el enrichment y el bot/snapshot no cambian de contrato; solo ganan el campo `sourceUrl`.

## 2. Modelo de datos (extensión)

### 2.1 `NormalizedItem` / `StoredItem` / `Item` público / `Snapshot`

Se añade **un** campo a `NormalizedItem` (`backend/src/shared/types.ts`), que se propaga:

- `sourceUrl?: string` — URL absoluta http(s) del ítem en su origen. Normalizada con el helper existente `imageUrl(base, url)` (renombrado conceptualmente a "resolver URL"; se reutiliza tal cual). Viaja en el snapshot (ya se hace `Omit<…,"raw">`, no se persiste `raw`).

`StoredItem` lo hereda. El `Item` del frontend público (`frontend-public/src/types.ts`) gana `sourceUrl?: string`. El `Snapshot` no cambia su forma (sigue con `sources` para la home como fallback).

### 2.2 `Source` (config del motor)

`Source` (`backend/src/shared/types.ts`) gana:

- `connector: "jsonApi" | "headless" | "ai" | "rest"` — se añade `"rest"` (motor declarativo). Los valores existentes se mantienen por compatibilidad; `jsonApi`/`headless` siguen resolviendo por `getConnector(id)`.
- `rest?: RestConfig` — config del motor (solo si `connector:"rest"`).
- `status?: "ok" | "error" | "blocked"` — sustituye/extiende a `lastStatus`. `blocked` = fuente conocida pero inalcanzable por gating (reCAPTCHA/Cloudflare); no es error ni se reintenta como tal.
- `lastFetched?: number` — total de ítems traídos en la última corrida (no upserts).
- `endpointStats?: EndpointStat[]` — por endpoint: `{ label, fetched, error? }`.

Tipos nuevos (en `backend/src/connectors/restConfig.ts`):

```ts
export interface FieldMap {
  externalId: string; // dot-path al id (ej "id")
  titulo: string; // dot-path o plantilla "{place}"
  texto?: string[]; // dot-paths que se unen con " · "
  lat?: string;
  lng?: string;
  imageUrl?: string; // dot-path; relativa se resuelve contra `base`
  sourceUrl?: string; // dot-path al permalink del ítem en la API…
  sourceUrlTemplate?: string; // …o plantilla "https://sitio/r/{id}" si la API no lo da
  status?: string;
}

export interface RestEndpoint {
  label: string; // p.ej. "reportes"
  url: string; // URL absoluta del endpoint JSON
  category: Category; // categoría destino
  itemsPath?: string; // dot-path al array ("data", "reports", "features"); "" = la raíz es array
  shape?: "array" | "geojson"; // geojson = {features:[{properties,geometry.coordinates:[lng,lat]}]}
  fieldMap: FieldMap;
  headers?: Record<string, string>; // p.ej. apikey/authorization de Supabase
}

export interface RestConfig {
  base: string; // origen para resolver imageUrl/sourceUrl relativas
  endpoints: RestEndpoint[];
}
```

## 3. Motor `rest` (`backend/src/connectors/restEngine.ts`)

Funciones puras + inyectables (testeables sin red):

- `getPath(obj, path): unknown` — dot-path tolerante (`"a.b.0.c"`); devuelve `undefined` si falta.
- `fillTemplate(tpl, obj): string` — sustituye `{campo}` por `getPath(obj, campo)`.
- `mapRow(row, ep, base): NormalizedItem | null` — aplica `fieldMap`. `geojson` toma `properties` como row y `geometry.coordinates` como `[lng,lat]`. Une `texto[]` con `" · "` (descarta vacíos, trunca 500). `imageUrl`/`sourceUrl` se normalizan con `imageUrl(base, …)`. `sourceUrl` se prefiere del campo; si no hay y existe `sourceUrlTemplate`, se construye. `externalId` obligatorio → si falta, devuelve `null` (se descarta + conteo logueado). `titulo` vacío → fallback por categoría.
- `runRestSource(source, deps): Promise<{ items; endpointStats }>` — por cada endpoint: `fetchJson(url, 15000, headers)` envuelto en try/catch **que registra el error por endpoint** (`endpointStats`), no lo traga global; extrae `itemsPath`; `mapRow` cada fila; concatena. Un endpoint roto deja `fetched:0, error:msg` pero **no** impide los demás.

`deps`: `{ fetchJson }` (reutiliza `@/connectors/http`).

## 4. Presets de las 4 fuentes actuales (`backend/src/connectors/presets.ts`)

Las 4 fuentes se expresan como `RestConfig` (reemplazan a los `.ts` a mano). Ejemplos clave (mapeos verificados en vivo 2026-06-29):

- **sismovenezuela** (`base: https://www.sismovenezuela.com`): endpoints `reportes` (`/api/reports/feed?limit=200`, array raíz, `sourceUrl: "source_url"`, `imageUrl: "media_urls.0"`), `acopios` (`/api/relief-centers`), `edificios` (`/api/building-damage`, shape `geojson`), `solicitudes` (`/api/needs`, itemsPath `data`).
- **ninosvenezuela** (Supabase): endpoint `desaparecidos`, headers `apikey`/`authorization`, `imageUrl: "foto_url"`, sin lat/lng, `sourceUrlTemplate: "https://ninosvenezuela.org/?id={id}"` (verificar ruta real de detalle en implementación).
- **hospitalesvenezuela** (Supabase): endpoint `hospitales`, lat/lng directos, `status` operativo.
- **terremotovenezuela**: **API a re-descubrir** (su `/api/*` hoy devuelve el SPA). En implementación: método de chunks JS (lesson `nextjs-find-real-api-via-chunks`) para hallar el nuevo host/ruta; mapear `sourceUrl` al detalle del ítem. Si resulta gateada → `status:"blocked"` + nota.

El **seed** (`seed.ts`) crea cada fuente con `connector:"rest"` y su `rest: PRESETS[id]`. Migración: las fuentes ya existentes en DynamoDB se actualizan a `connector:"rest"` + config en el `ensureSeedSources` (que hoy solo crea si no existe → se cambia a "crea o repara la config base" de las seed, sin pisar `enabled`).

## 5. Orquestador (`backend/src/scraper/orchestrator.ts`)

`runScrape` añade una rama: `connector === "rest"` → `runRestSource(source, deps)`; persiste `lastFetched`, `endpointStats`, y `status` = `"error"` solo si **todos** los endpoints fallaron, `"ok"` si al menos uno trajo datos, y conserva `"blocked"` si la fuente está marcada así (no se reintenta a `error`). `ai`/`jsonApi`/`headless` intactos. Aislamiento por fuente intacto.

## 6. Permalink en frontend y bot

- **Público** (`frontend-public/src/components/ItemList.tsx`): junto al ítem, enlace "Ver en la fuente" → `item.sourceUrl` (target `_blank`, `rel="noopener noreferrer nofollow"`). Si no hay `sourceUrl`, cae al link de la fuente (`snapshot.sources[sourceId].url`).
- **Bot** (`backend/src/telegram/…`): al citar un ítem, incluir el `sourceUrl` si existe. (Cambio menor; el bot ya arma respuestas con ítems del snapshot.)

## 7. Admin: alta/edición de fuentes `rest` + "Probar"

### 7.1 Admin API (`backend/src/admin-api/router.ts`)

- `POST /sources` gana un `tipo` opcional en el body: `"ai"` (default, retrocompatible) o `"rest"`. Para `"rest"`, el body acepta `rest: RestConfig` validado con Zod (URLs con guard SSRF `assertPublicHttpUrl` en cada `endpoint.url`). Crea la fuente con `connector:"rest"`.
- `PATCH /sources/{id}` gana edición de `rest` (además del `enabled` actual) para corregir mapeos sin recrear.
- `POST /sources/probe` — body `{ rest: RestConfig }` → ejecuta `runRestSource` en dry-run (sin persistir) y devuelve `{ endpointStats, sample: NormalizedItem[] (≤5 por endpoint) }`. Sirve para validar el mapeo antes de guardar. SSRF aplicado.

### 7.2 Admin SPA (`frontend-admin/src/components/Sources.tsx`)

- El form "Agregar fuente" gana un selector **Tipo: IA / API JSON**. En "API JSON": campos para `base` y una tabla de endpoints (`label`, `url`, `category`, `itemsPath`, `shape`, y mapeo de campos). Botón **"Probar"** → `api.probeSource(rest)` → muestra los ítems de muestra y los `endpointStats` (✓ N ítems / ✗ error) antes de "Guardar".
- En la lista, cada fuente muestra su `status` (ok / error / **bloqueada**) y `lastFetched`; las `rest` permiten "Editar mapeo".
- `api.ts` gana `probeSource(rest)` y `updateSourceConfig(id, rest)`.

## 8. Observabilidad (matar fallos silenciosos)

- `GET /stats` (Dashboard) ya devuelve `sources` con `lastRun`/`lastStatus`; se extiende con `status`, `lastFetched` y `endpointStats`. El Dashboard marca en **amarillo** "ok con 0 ítems" y en **rojo** "error"; "bloqueada" en gris con tooltip.
- El motor nunca traga un fallo a nivel fuente sin registrarlo en `endpointStats`.

## 9. Fuentes bloqueadas

- `desaparecidosterremotovenezuela.com` (reCAPTCHA v3): permanece fuera; outreach a The Empire Tech (borrador en `docs/outreach/`). Se puede sembrar como `status:"blocked"` con `enabled:false` para que figure en el admin como pendiente, sin intentos.
- Cualquier fuente que en `probe` dé HTML en vez de JSON (SPA sin API hallada) se documenta como bloqueada.

## 10. Infra

Sin cambios de stack: el motor `rest` corre en el **ScraperFn** (igual que los conectores actuales). `POST /sources/probe` corre en el **admin-api Lambda** (hace fetch saliente; ya puede). Sin Bedrock nuevo. SSRF ya cableado.

## 11. Manejo de errores

- Endpoint que devuelve no-JSON / HTML / 4xx-5xx / timeout → `endpointStats[i].error`, 0 ítems de ese endpoint, los demás siguen.
- Fila sin `externalId` → descartada + conteo logueado (Powertools).
- `imageUrl`/`sourceUrl` inválida o relativa irresoluble → `undefined` (helper existente).
- Fuente con todos los endpoints rotos → `status:"error"` + `errorMsg`; no rompe las otras fuentes.

## 12. Pruebas (TDD)

- `restEngine`: `getPath` (anidado, índices, faltante), `fillTemplate`, `mapRow` (array vs geojson, texto unido, sourceUrl campo vs template, imageUrl relativa→absoluta, externalId faltante→null, titulo fallback), `runRestSource` (un endpoint roto no tumba los demás; endpointStats correctos) con `fetchJson` mockeado.
- `presets`: cada preset mapea su fixture (reusar fixtures existentes + nuevas) a los ítems esperados, **incluido `sourceUrl`** (sismovenezuela `source_url`).
- `orchestrator`: fuente `rest` corre el motor y persiste `status/lastFetched/endpointStats`; `blocked` no se degrada a `error`; aislamiento.
- `router`: `POST /sources` tipo rest (válido/ inválido/ SSRF), `PATCH` config, `POST /sources/probe` (muestra + stats; SSRF rechaza host privado).
- `buildSnapshot`: `sourceUrl` viaja al snapshot.
- frontend público: `ItemList` pinta "Ver en la fuente" con `sourceUrl` y cae a la home si falta.
- admin: `Sources` selector tipo + "Probar" llama `probeSource`; lista muestra `status`/`lastFetched`.

## 13. Convenciones y alcance

TypeScript strict, alias `@/`, Zod, sin `console.log` (Powertools), TDD (`vitest`), Conventional Commits con emoji, rama `feat/conector-centralizador`. Validar con smoke en prod sobre el snapshot real (lesson `validate-data-features-with-prod-smoke`).

**Fuera de alcance (fast-follow):** re-hospedaje de imágenes en S3 (Fase 2 de imágenes); navegador headless; moderación previa; reconciliación/TTL de ítems de fuentes borradas. No se tocan otras fases salvo: `sourceUrl` en tipos/snapshot/frontend/bot, `connector:"rest"` + motor + presets, rutas admin nuevas, y la observabilidad de `/stats`.

## 14. Fases de implementación (planes separados)

1. **Fase A — `sourceUrl` end-to-end** (tipos → presets/conectores mapean → snapshot → público → bot). Recupera el "link directo" ya, bajo riesgo.
2. **Fase B — motor `rest` + presets** (reescribe las 4 fuentes como config; arregla observabilidad por endpoint).
3. **Fase C — arreglar `terremotovenezuela`** (re-descubrir API → preset) y sembrar bloqueadas con `status:"blocked"`.
4. **Fase D — admin alta/edición `rest` + "Probar" + Dashboard de status.**

Cada fase produce software funcionando y testeable por sí sola.

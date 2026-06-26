# VenezuelaHelp — Analítica de visitantes & Usuarios de Telegram — Diseño (Spec)

- **Fecha:** 2026-06-26
- **Estado:** Aprobado
- **Contexto:** Fases 1–6 desplegadas (scraper, bot Telegram, frontends público/admin con dominio `venezuelahelp.click`). El admin gestiona fuentes y config. Esta fase agrega **dos vistas nuevas en el admin**: analítica agregada de visitantes del frontend público, y un directorio de usuarios del bot de Telegram.

## 1. Propósito y decisiones

Dar al patrocinador visibilidad de **quién usa la plataforma**: de qué país, navegador y dispositivo llegan los visitantes web (agregado, anónimo), y la lista individual de usuarios que escriben al bot de Telegram (identificables).

Decisiones tomadas en brainstorming:

- **Objetivo:** ambas cosas — analítica web agregada **y** lista individual de usuarios de Telegram.
- **Captura web:** **beacon endpoint** — el frontend público dispara un POST mínimo al cargar; un Lambda lo escribe en DynamoDB. (Descartado: logs de CloudFront por no ser en vivo y más complejos; analytics de terceros por mantener todo en el admin.)
- **Geolocalización:** **solo país**, vía el header gratis `CloudFront-Viewer-Country`; navegador/dispositivo/SO desde el `User-Agent`. **Sin ISP ni ciudad** (descartado MaxMind y APIs de pago por costo/complejidad).
- **Privacidad/retención:** **no se guarda la IP cruda** (solo el país derivado). Eventos de visita con **TTL 90 días**. Sin cookies de tracking → **sin banner de consentimiento**.
- **Telegram:** la API del bot solo da `id`, `username`, nombre y `language_code` (no país/navegador/dispositivo/IP). Se captura eso por usuario.

Restricción transversal del proyecto: **minimizar costo** (sin costos fijos, pago por uso). El sitio estático sigue cacheado en CloudFront; el beacon es una llamada aparte y barata.

## 2. Arquitectura

```
Frontend público ──(beacon: POST /api/track al montar)──┐
   servido por la distribución CloudFront del público    │  CloudFront agrega
   (misma distribución; nuevo behavior "api/track")       │  el header CloudFront-Viewer-Country
                                                          ▼
                                          [Lambda track] ──> DynamoDB
                                            lee país (header) + UA           (eventos VISIT + contadores VSTAT)
                                            nunca guarda IP

Bot Telegram ──(cada mensaje)──> [Lambda telegram existente] ──upsert──> DynamoDB (TGUSER por chatId)

Admin (Cognito) ──GET /analytics, GET /tg-users──> [Lambda admin existente] ──> tablas + KPIs en el SPA
```

- El beacon va **a través de la distribución CloudFront del frontend público** (la misma que sirve el sitio), en un **behavior nuevo con path pattern `api/track`** cuyo origen es la HTTP API del beacon. Esto da: mismo origen (sin CORS), el header `CloudFront-Viewer-Country` (CloudFront lo añade vía un `OriginRequestPolicy` que lo reenvía), y no toca el sitio estático cacheado.
- El behavior usa **`CachePolicy.CACHING_DISABLED`** y un `OriginRequestPolicy` que reenvía `CloudFront-Viewer-Country` y `User-Agent`. Métodos permitidos: incluye `POST`.
- Throttle en la HTTP API del beacon + el `BudgetStack` existente acotan abuso/costo.

## 3. Modelo de datos (misma tabla single-table `VenezuelaHelp`)

| Entidad           | PK                   | SK                                                                                                           | Atributos                                                                                                                                |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Evento de visita  | `VISIT#<yyyy-mm-dd>` | `<ISO-ts>#<rand6>`                                                                                           | `country` (ISO-2 o `ZZ`), `browser`, `device` (`mobile`/`tablet`/`desktop`), `os`, `path`, `referrer`, `ts` (ISO), `ttl` (epoch s, +90d) |
| Contador agregado | `VSTAT`              | `<yyyy-mm-dd>#_total` · `<yyyy-mm-dd>#country#<XX>` · `<yyyy-mm-dd>#browser#<B>` · `<yyyy-mm-dd>#device#<D>` | `count` (número, incremento atómico `ADD`), `ttl` (epoch s, +400d)                                                                       |
| Usuario Telegram  | `TGUSER`             | `<chatId>`                                                                                                   | `chatId`, `username?`, `firstName?`, `lastName?`, `languageCode?`, `firstSeenAt` (ISO), `lastSeenAt` (ISO), `msgCount` (número, `ADD`)   |

- **Eventos `VISIT#<fecha>`** → para la **lista de visitas recientes** (Query de la partición del día, orden descendente, límite 100). Se auto-eliminan a los 90 días por el TTL `ttl` (ya configurado en la tabla).
- **Contadores `VSTAT`** → PK constante `VSTAT`, SK con prefijo de fecha → una sola **Query por rango de SK** (`between <desde> and <hasta>`) trae todos los contadores del rango para los KPIs/gráficos, sin escanear eventos. Son **conteos anónimos** (sin PII) → TTL más largo (400d) para tener tendencia histórica barata. _Caveat conocido:_ partición única `VSTAT` = punto caliente si el tráfico es muy alto; sharding por sufijo queda como fast-follow.
- **`TGUSER`** con PK constante → el admin lista **todos** los usuarios con una sola Query.

El TTL usa el atributo **`ttl`** (epoch en segundos), el mismo que ya usan los QA logs y el rate-limit. No se modifica la config de la tabla.

## 4. Backend

### 4.1 Beacon (`backend/src/track/`)

- **`parseUserAgent(ua: string): { browser: string; device: "mobile"|"tablet"|"desktop"; os: string }`** — parser mínimo propio (sin dependencia externa), testeable: detecta navegador (Chrome, Edge, Opera, Samsung, Firefox, Safari, otro), dispositivo (mobile/tablet/desktop por tokens `Mobi`/`Tablet`/`iPad`) y SO (Windows, macOS, iOS, Android, Linux, otro). Entrada vacía/desconocida → `"unknown"` / `"desktop"`.
- **`handler`** (Lambda, HTTP API): lee `CloudFront-Viewer-Country` (default `"ZZ"` si falta), `User-Agent`, y el body JSON `{ path?: string; referrer?: string }`. Valida suavemente (recorta `path`/`referrer` a 200 chars; ignora campos extra). Escribe vía `VisitRepo.record(...)`. **Siempre responde `204`** (incluso ante body inválido o fallo de escritura, que se loguea) para **nunca romper** la carga del sitio público.
- **`VisitRepo`** (`backend/src/shared/repos/visitRepo.ts`):
  - `record(v: { country; browser; device; os; path; referrer; now: string })` → un `PutItem` del evento `VISIT#<fecha>` + cuatro `UpdateItem ... ADD #count :1` sobre los contadores `VSTAT` (`_total`, `country#<XX>`, `browser#<B>`, `device#<D>`), cada uno con `ttl`. `rand6` evita colisiones de SK en el mismo ms.
  - `recent(limit = 100)` → Query de `VISIT#<hoy>` (y, si quedan cupos, del día anterior) orden descendente.
  - `statsRange(fromDate, toDate)` → Query `PK=VSTAT`, `SK between <fromDate> and <toDate+'￿'>`; agrega los contadores en `{ total, byCountry, byBrowser, byDevice }` por rango.

### 4.2 Captura de usuario de Telegram

- Extender el tipo **`TgUser`** (`backend/src/telegram/types.ts`) con `first_name?`, `last_name?`, `language_code?`.
- **`TgUserRepo`** (`backend/src/shared/repos/tgUserRepo.ts`):
  - `upsert(u: { chatId; username?; firstName?; lastName?; languageCode?; now })` → un `UpdateItem`: `SET username=:u, firstName=:f, lastName=:l, languageCode=:lc, lastSeenAt=:now, firstSeenAt = if_not_exists(firstSeenAt, :now) ADD msgCount :1`.
  - `list(): Promise<TgUserRecord[]>` → Query `PK=TGUSER`.
- En **`backend/src/telegram/handler.ts`**, al recibir un mensaje válido (tras tener `msg.chat.id` y `msg.from`), llamar `tgUserRepo.upsert(...)`. Va envuelto en try/catch propio: **un fallo aquí NO rompe la respuesta del bot** (se loguea y se continúa). Se inyecta como dep (igual que los demás repos del handler) para tests.

### 4.3 Admin API (`backend/src/admin-api/router.ts`)

Dos rutas nuevas (tras el JWT authorizer):

- **`GET /analytics`** → `{ kpis: { today, last7, last30 }, byCountry: Array<{key,count}>, byBrowser: [...], byDevice: [...], recent: Array<{ts,country,browser,device,path}> }`. Usa `visitRepo.statsRange` (hoy; hoy-6d…hoy; hoy-29d…hoy) y `visitRepo.recent(100)`. `today/last7/last30` salen del `_total` por rango.
- **`GET /tg-users`** → `tgUserRepo.list()` ordenado por `lastSeenAt` desc. Forma: `Array<{ chatId, username?, nombre, languageCode?, firstSeenAt, lastSeenAt, msgCount }>` (`nombre` = `firstName + ' ' + lastName` recortado).

El handler del admin ya enruta method+path; se añaden estos dos matches. El Lambda del admin ya tiene lectura de la tabla (no cambia infra de permisos).

## 5. Frontend

### 5.1 Público (`frontend-public/`)

- Módulo `src/track.ts` con `sendBeacon()`: al montar la app **una vez por carga**, envía `navigator.sendBeacon('/api/track', Blob<json>)` con `{ path: location.pathname, referrer: document.referrer }`. Fallback a `fetch('/api/track', { method:'POST', keepalive:true, body })` si `sendBeacon` no existe. Fire-and-forget, sin UI, sin bloquear render. Errores se ignoran (no rompen el sitio).
- Se invoca desde el `useEffect` de arranque de la app (junto a la carga del snapshot).

### 5.2 Admin (`frontend-admin/`)

- Dos pestañas nuevas en la nav: **Analítica** y **Usuarios**.
- **`Analytics.tsx`:** KPIs (visitas hoy / 7d / 30d), tres bloques de desglose (país, navegador, dispositivo) como listas con barra proporcional, y una tabla de **visitas recientes** (hora · país · navegador · dispositivo · página). Botón "Actualizar" (mismo patrón que el Dashboard).
- **`Users.tsx`:** tabla de usuarios de Telegram (nombre/username · idioma · primera vez · última vez · # mensajes), ordenable por actividad. Botón "Actualizar".
- `api.ts` gana `getAnalytics()` (GET /analytics) y `getTgUsers()` (GET /tg-users).
- Sigue `DESIGN.md` (institucional, accesible, tokens OKLCH). Estados de carga y vacío ("aún no hay visitas/usuarios").

## 6. Infra (CDK)

- **`FrontendStack`** (dueño de la distribución pública): añade
  - el **Lambda `track`** (`NodejsFunction`, Node 20, ESM, log retention 14d) con grant de **escritura** a la tabla;
  - una **HTTP API** pública (sin auth) con ruta `POST /api/track` y **throttle** (rate/burst acotados);
  - un **behavior** en la distribución existente con path pattern `api/track`, origen = la HTTP API, `CachePolicy.CACHING_DISABLED`, y un `OriginRequestPolicy` que reenvía `CloudFront-Viewer-Country` y `User-Agent`, métodos incluyendo `POST`.
- **`AdminStack`**: dos rutas nuevas en la HTTP API (`GET /analytics`, `GET /tg-users`) → el Lambda admin existente (ya con lectura de la tabla).
- **`BotStack`**: sin cambios de infra (el Lambda de Telegram ya tiene RW a la tabla); solo cambia su código.
- **`DataStack`**: sin cambios (TTL `ttl` ya configurado; PAY_PER_REQUEST).

## 7. Manejo de errores

- **Beacon:** nunca propaga error al cliente → siempre `204`. Body inválido → se ignora el campo, no se rechaza. Fallo de DynamoDB → se loguea (Powertools) y se responde `204`. No rompe el sitio público.
- **Captura Telegram:** `tgUserRepo.upsert` en try/catch propio; un fallo se loguea y **no** afecta la respuesta del bot ni el flujo de QA.
- **Admin endpoints:** try/catch → `500 { error }` ante fallo de repo; respuestas validadas.
- Aislamiento: ningún subsistema nuevo rompe a los existentes.

## 8. Pruebas (TDD, vitest)

- `parseUserAgent`: Chrome/Safari/Firefox/Edge/Samsung; mobile/tablet/desktop; iOS/Android/Windows/macOS/Linux; UA vacío → defaults.
- `VisitRepo` (`aws-sdk-client-mock`): `record` escribe el evento + 4 incrementos con `ttl`; `recent` consulta la partición del día desc; `statsRange` agrega por rango (total/por dimensión).
- `track` handler: lee país del header (y default `ZZ`), parsea UA, recorta `path/referrer`, responde `204` siempre (incluido fallo de repo).
- `TgUserRepo`: `upsert` (primer alta vs incremento de `msgCount`, `firstSeenAt` estable), `list`.
- `telegram/handler`: al recibir mensaje llama `tgUserRepo.upsert`; un throw del upsert no rompe la respuesta del bot.
- `admin-api/router`: `GET /analytics` (forma de la respuesta con repos mockeados), `GET /tg-users` (orden por `lastSeenAt`).
- Infra (`aws-cdk-lib/assertions`): `FrontendStack` tiene el Lambda track, la HTTP API con throttle, y el behavior `api/track` con cache deshabilitado + origin request policy con `CloudFront-Viewer-Country`; `AdminStack` tiene las 2 rutas nuevas.
- Frontend público: `sendBeacon` arma el body `{path,referrer}` y se llama una vez al montar.
- Frontend admin: `Analytics`/`Users` renderizan KPIs/tablas y estados vacíos; `api.ts` `getAnalytics`/`getTgUsers`.

## 9. Convenciones y alcance

TypeScript strict, alias `@/`, Zod donde aplique, sin `console.log` (Powertools), TDD, Conventional Commits, rama `feat/analitica-usuarios`. Nunca commitear directo a `main`.

**Fuera de alcance (fast-follow):** ISP/ciudad (MaxMind), identidad individual de visitantes web, tiempo real (websockets), filtrado de bots/crawlers más allá de lo básico, export CSV, sharding de la partición `VSTAT` si el tráfico crece. No se modifican las fases previas salvo: extender `TgUser`, captura en el handler de Telegram, 2 rutas en el admin-api, y los recursos nuevos en `FrontendStack`.

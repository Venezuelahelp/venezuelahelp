# VenezuelaHelp

Plataforma **serverless de bajo costo** para agregar información del terremoto de Venezuela (evento del 25 de junio de 2026) desde fuentes públicas de terceros, y exponerla vía un **bot de Telegram** (preguntas con RAG por palabra clave + Bedrock) y dos **frontends web** (público y admin). Patrocinado por una persona → la restricción transversal es **minimizar costo** (sin costos fijos, pago por uso).

## Estado

Proyecto en construcción. La fuente de verdad es:

- **Spec de diseño:** `docs/superpowers/specs/2026-06-25-venezuelahelp-design.md`
- **Planes por fase:** `docs/superpowers/plans/`
  - Fase 1 — Cimientos (monorepo + capa de datos + `DataStack`): `2026-06-25-fase1-cimientos.md`
  - Fases 2–5 (scraper, bot Telegram, frontend público, admin): se escriben al terminar la anterior.

Lee siempre el spec y el plan de la fase activa antes de implementar.

## Arquitectura (Opción A — "casi gratis")

- **Scraping programado** (EventBridge cada ~30 min, configurable) → DynamoDB. No se scrapea por mensaje.
- **RAG "pobre"**: el bot recupera por palabra clave **sobre el `snapshot.json` de S3** (lo carga en memoria y rankea en `telegram/retrieval.ts`; **no consulta DynamoDB** en tiempo de pregunta) + LLM barato de Bedrock (**Amazon Nova Lite** por defecto, configurable a Claude Haiku). **Sin base vectorial** (OpenSearch Serverless descartado por costo). El ranking infiere la categoría de la pregunta y la prioriza, pondera por campo (título/ubicación > texto) y aplica cuota por categoría; un scoring por mero conteo de keywords producía empates masivos y dejaba fuera las fichas relevantes. <!-- /aprende 2026-06-26 -->
- **Conectores enchufables** por fuente. Cuatro tipos en el campo `Source.connector`: **`rest`** (motor declarativo config-driven, el preferido), **`ai`** (HTML→Bedrock para fuentes de noticias), **`jsonApi`** (conector bespoke por `source.id` vía `registry.ts`, para fuentes irregulares) y `headless` (Playwright, sin implementar). Ver el bloque "Conector centralizador `rest`" más abajo.
- **Frontend público** lee un `snapshot.json` cacheado en S3/CloudFront que el scraper regenera → el tráfico público no pega a Lambda/DynamoDB.
- Servicios: Lambda, DynamoDB (single-table), S3 + CloudFront (×2 + snapshot), API Gateway HTTP API, Cognito (admin), EventBridge, SSM Parameter Store, Bedrock.

> **API público para terceros (`VenezuelaHelpApiStack`, 8º stack).** API de **solo lectura** para que otras organizaciones consuman la misma data pública. Dominio propio `api.<dominio>` (cert wildcard). Rutas `/v1/items` (filtros `category`/`q`/`near`/`limit`/`cursor`), `/v1/categories`, `/v1/sources`, `/v1/meta` — el Lambda `data-api` **lee el mismo `snapshot.json` por HTTP igual que el front** (`data-api/snapshot.ts`, gunzip+cache; reusa `normalize` de retrieval para el keyword-match), **no toca DynamoDB ni S3**. HTTP API **no soporta API keys nativas** → claves propias: valor en claro `vh_live_<base64url>` entregado **una sola vez**, en DynamoDB solo el **sha256** como PK (lookup O(1) en un **Lambda authorizer** que **falla cerrado** y rate-limita por key reutilizando `RateLimitRepo`). **Flujo:** form público `#/api` → `POST /api-access/requests` (intake `public-api/handler.ts`, Zod + rate-limit por IP, status `pendiente`) → el admin (tab **API**, `ApiRequests.tsx`) lista/aprueba/rechaza; **aprobar** emite la key y la **muestra una sola vez** (no hay SES: se comparte manual al correo del solicitante) + revocar. Rutas admin nuevas en `admin-api/router.ts` (`/api-requests`, `/api-requests/{id}/approve|reject`, `/api-keys`, `/api-keys/{id}/revoke`). Repos `apiRequestRepo`/`apiKeyRepo`. El front público **no cambia** cómo lee datos; el `/v1` es aditivo. <!-- /aprende 2026-06-29 -->

> **Conector centralizador `rest` (config-driven).** Un único motor declarativo (`backend/src/connectors/restEngine.ts`: `getPath`/`fillTemplate`/`mapRow`/`runRestSource`) ingiere cualquier fuente con API JSON parametrizado por una `RestConfig` (`restConfig.ts`) guardada en la `Source` (`base` + `endpoints[]` con `itemsPath`, `shape:array|geojson`, y `fieldMap` con dot-paths para `externalId/titulo/texto[]/lat/lng/imageUrl/sourceUrl/status` + `sourceUrlTemplate`). Las 4 fuentes "limpias" se expresan como **presets** (`presets.ts`); hoy solo **sismovenezuela** migró (captura `source_url` en sus 4 categorías). Las irregulares siguen **bespoke** en `registry.ts`: `terremotovenezuela` (categoría-por-`type` en un endpoint), `ninosvenezuela`/`hospitalesvenezuela` (texto etiquetado de Supabase). **Desde el admin** se pueden crear/editar fuentes `rest` (form "API JSON" + botón **"Probar"** = `POST /sources/probe`, dry-run con muestra) **sin deploy**. El orquestador persiste `status` (ok/error/**blocked**), `lastFetched` y `endpointStats[]` por fuente → el Dashboard distingue "ok con 0 ítems" (amarillo) de roto (rojo) y **se acabaron los fallos silenciosos**. Un endpoint caído no tumba los demás; una fuente `rest` con TODOS los endpoints rotos se marca `error` (no `ok`). `ensureSeedSources` **repara** la config base de las fuentes sembradas (migra connector/rest) preservando `enabled`/`trustLevel`/timestamps. <!-- /aprende 2026-06-29 -->

> **Permalink por ítem (`sourceUrl`).** `NormalizedItem`/`StoredItem`/`Item` público/`PublicItem` del bot llevan `sourceUrl?` — el link directo al origen del ítem (p.ej. el TikTok/IG de `sismovenezuela.source_url`). Viaja solo en el snapshot (spread en `toPublic`; `snapshot.ts` no cambió). Solo se mapea cuando la API da un permalink real; si no, el frontend/bot caen a la home de la fuente (`snapshot.sources`) — **no se fabrican deep-links que darían 404**. El público pinta "Ver original" (`Source.tsx` con prop `sourceUrl`), el bot añade un botón "🔗 Ver original" (`cards.ts`). <!-- /aprende 2026-06-29 -->

> **El scrape es asíncrono.** `POST /scrape` (botón "Scrape ahora" del admin) invoca el Lambda del scraper con `InvocationType: Event` y devuelve **202 `{started:true}`** de inmediato; la extracción sigue en segundo plano (~1–2 min: baja HTML, extrae, llama a Bedrock por cada fuente IA que cambió). **No hay señal de "terminó"**. Por eso el admin muestra un aviso "Scrape iniciado…" al disparar y un botón "Actualizar" en el Dashboard para re-consultar conteos/estado cuando el usuario quiera. No esperar respuesta síncrona con los ítems.

> **Conector IA y modelo de extracción.** Las fuentes `connector:"ai"` se extraen con **tool use** (salida estructurada de Bedrock) usando **Claude Haiku 4.5** (`AI_EXTRACT_MODEL` en `aiConnector.ts`), no el modelo de `CONFIG` (Nova Lite falla con 424 intermitente en tool use sobre páginas grandes). El bot sí usa el modelo barato de `CONFIG`. La extracción corre cada 6 h y solo si el contenido cambió (hash). `htmlToText` recorta a `<main>`/`<article>`/cuerpo para no mandar el chrome de navegación a Bedrock. Páginas muy-JS o con gating por IP (Cloudflare) quedan fuera de alcance (no hay navegador headless). <!-- /aprende 2026-06-26 -->

> **Enrichment (dedup + confianza).** El módulo `backend/src/enrichment/` marca, de forma determinista y sin LLM, duplicados y un nivel de confianza por ítem; corre **dentro de `buildSnapshot`** y las marcas viajan en el `snapshot.json` (no se persisten en DynamoDB). Clave de cluster **por categoría**: `desaparecidos`→**nombre (tokens ≥3 letras ORDENADOS, SIN geocelda)** para agrupar a la misma persona entre fuentes aunque difieran el orden del nombre o las coordenadas (clave de la corroboración cruzada), `edificios`/`acopios`→geocell+título, `reportes`/`solicitudes`→firma del **texto** (el título suele ser el nombre del medio) con refuerzo Jaccard (`enrichment.jaccardThreshold`, default 0.7) y "texto <3 tokens → clave única". El más reciente del cluster es canónico. `trust`: `corroborado` (≥2 fuentes) / `no_verificado` (1 fuente) / `sospechoso` (geocerca fuera de VE, blocklist, o título+texto vacíos — "texto corto" NO es sospechoso) / `verificado` (fuentes `trustLevel:"official"`, hoy ninguna). Parámetros en `Config.enrichment` (`CONFIG#GLOBAL`, editable sin deploy; si no hay Item, manda el `DEFAULT_CONFIG` del código). El bot excluye `sospechoso` y prioriza canónicos. **El público también usa el enrichment** (`frontend-public`): `flatten` **colapsa duplicados** (muestra solo `isCanonical !== false` → "no duplica") y `ItemList` pinta la insignia **"En N fuentes"** cuando `sourcesCount ≥ 2` (corroboración cruzada). El `Item` público lleva `trust`/`sourcesCount`/`isCanonical`/`dupOf`. Smoke real: ~14.7k duplicados colapsados, ~3.3k corroborados. <!-- /aprende 2026-06-29 -->

> **Analítica de visitas (beacon).** El frontend público dispara el beacon **una vez por carga** desde un `useEffect(() => sendBeacon(), [])` al montar `frontend-public/src/App.tsx` (`sendBeacon` en `frontend-public/src/track.ts`). Va `POST /api/track` **same-origin vía CloudFront** (sin CORS) → Lambda `TrackFn` → `VisitRepo.record()` (contadores `VSTAT#…` + eventos `VISIT#<fecha>`); el país lo deriva el backend del header `CloudFront-Viewer-Country`. El admin lee con `GET /analytics`. Si la analítica aparece vacía, **verificar que el cliente INVOQUE `sendBeacon()`, no solo lo importe** (fue dead-code una vez, con toda la infra cableada). El público es una sola vista sin router (filtrado client-side), así que el beacon al montar cubre toda visita. <!-- /aprende 2026-06-26 -->

## Fuentes — estado y pendientes

Hoy se scrapean **10** fuentes con datos (`backend/src/scraper/seed.ts`); una 11ª (`desaparecidosterremotovenezuela`) se siembra `blocked`+deshabilitada.

- **`rest` (preset)**: `sismovenezuela`, `usgs` (GeoJSON sismos VE), `vzlayuda` (Supabase, solicitudes+acopios), `sos-en-venezuela` (API Express, desaparecidos+hospitales+solicitudes), `localiza-pacientes` (Next.js `/api/hospitals`), `red-esperanza` (Supabase, ~33k desaparecidos+acopios+necesidades), `pacientesve` (Google Sheets, ~5.5k pacientes).
- **bespoke (`registry.ts`)**: `terremotovenezuela`, `ninosvenezuela`, `hospitalesvenezuela`.
- **`ai`**: `venezuela-te-busca` (su API REST pide API key → sin key solo 24 ítems; queda `ai` con outreach pendiente), y `cruz-roja-espana-dona` (landing de donación **estática**, sin datos).

> **6 fuentes `ai` que el operador agregó traían 0 ítems** (eran SPAs que el extractor HTML→Bedrock no puede leer). Se reconvirtieron a `rest` descubriendo su API real (chunks JS / Supabase anon key / Google Sheets). El alta vino del admin, así que `ensureSeedSources` las **repara** a `rest` por su `id` existente sin perder estado. <!-- /aprende 2026-06-29 -->

> **`red-esperanza` desbloquea de facto a theempire.** Su backend Supabase (`hqoirxajavaaasvdfjoy.supabase.co`, vista pública, sin reCAPTCHA) es un **espejo** de los ~33k desaparecidos de `desaparecidosterremotovenezuela.com`/theempire (campo `fuente:"desaparecidos_terremoto_vzla"`, fotos en `cdn-imagenes.theempire.tech`). Por eso la fuente theempire bloqueada ya no es crítica. <!-- /aprende 2026-06-29 -->

> **Motor `rest` — features añadidas para estas fuentes:** `paginate:{pageSize,maxItems}` (PostgREST `limit`/`offset`; red-esperanza pagina ~33k), `skipRows` (saltar el encabezado de una Google Sheet), `externalIdFrom:[...]` (id compuesto `a|b|c` para fuentes sin id estable, p.ej. pacientesve nombre|cédula|hospital). Las claves anon/publishable de Supabase y el header `Referer` (Google Sheets) viajan en `endpoint.headers`. <!-- /aprende 2026-06-29 -->

> **Snapshot gzip (snapshot ~38MB → ~6.9MB).** Con todas las fuentes el `snapshot.json` pesa ~38MB y **CloudFront NO auto-comprime objetos >10MB** → `buildSnapshot` lo escribe **gzip** (`Content-Encoding: gzip`): el navegador del público lo descomprime solo (descarga ~6.9MB) y el **bot lo gunzipea al leer** (`telegram/snapshot.ts`, detección por magic bytes `1f 8b` para compat con snapshots viejos). El mapa público clusteriza (`react-leaflet-cluster`) y la lista pagina, así que 45k+ desaparecidos no cuelgan el navegador. Bot y scraper a **1024MB**, scraper timeout **15min**. <!-- /aprende 2026-06-29 -->

> **`terremotovenezuela` — API movida a `api.terremotovenezuela.app` (arreglada 2026-06-29).** Su `/api/*` en el dominio de la web hoy devuelve un 404 prerenderizado (sirve el SPA). El backend real está en el subdominio `https://api.terremotovenezuela.app` (mismo shape: `{reports}` / `{markers}`; `photoUrl` relativa al subdominio); descubierto grepeando los chunks JS del bundle por la base-URL (NEXT). El conector bespoke `terremotovenezuela.ts` usa ese `BASE`. La home pública sigue siendo `terremotovenezuela.app` (Source.url). Sin permalink por ítem (la app muestra todo en un mapa, sin página de detalle) → cae a la home. <!-- /aprende 2026-06-29 -->

> **`desaparecidosterremotovenezuela.com` — BLOQUEADA por reCAPTCHA v3 (pendiente de acceso).** Es una fuente **distinta** (no comparte backend con `terremotovenezuela.app`; sus desaparecidos no salen en `/api/missing/map`). Su API real es `https://desaparecidos-terremoto-api.theempire.tech/api` (listado en `GET /personas`, campos en español: `nombre`/`edad`/`ubicacion`/`fecha`/`descripcion`/`foto`/`contacto`/`estado`/lat-lng). **Todos** los endpoints de lectura exigen `x-recaptcha-token` (reCAPTCHA v3) verificado contra Google en su backend → **sin conector HTTP simple ni bypass razonable** (mintar el token vía anchor/reload de Google falla con "Invalid domain for site key", y un token desde IP de Lambda tendría score bajo). Es la fuente de los reportes que QA echaba en falta (p.ej. "Robeth Enrique"). **Decisión (2026-06-27): pedir acceso ordenado** al operador **The Empire Tech** (`developer@theempire.tech`, CC `contacto@theempire.tech`) — borrador en `docs/outreach/2026-06-27-solicitud-acceso-theempire.md`. Cuando concedan API key/allowlist/feed: conector `jsonApi` nuevo + registro en `registry.ts`/`seed.ts` + test con fixture + deploy de `VenezuelaHelpScraperStack`. <!-- /aprende 2026-06-27 -->

## Estructura del repo

```
backend/         # Lambdas TypeScript (connectors, scraper, telegram, admin-api, public-snapshot, shared)
frontend-admin/  # Next.js export estático — backoffice con Cognito
frontend-public/ # Next.js export estático — público
infra/           # AWS CDK v2 (TypeScript) — todos los stacks
docs/            # spec y planes
```

## Modelo de datos — DynamoDB single-table `VenezuelaHelp`

PK/SK string, PAY_PER_REQUEST. Identidad estable por ítem da idempotencia (sin GSI).

| Entidad       | PK                | SK                        |
| ------------- | ----------------- | ------------------------- |
| Fuente          | `SOURCE#<id>`             | `META`                    |
| Ítem agregado   | `CAT#<categoria>`         | `<sourceId>#<externalId>` |
| Log Q&A         | `QA#<chatId>`             | `<ts>`                    |
| Config global   | `CONFIG`                  | `GLOBAL`                  |
| Solicitud API   | `APIREQ` (fija)           | `<uuid>`                  |
| API key         | `APIKEY` (fija)           | `<sha256(rawKey)>`        |

> ⚠️ **Las entidades del programa de API usan una partición COMPARTIDA (PK fija) y se listan con `Query`, NO `Scan`.** La tabla tiene ~55k ítems `CAT#`; un `Scan` completo por cada `list()` saturaba la capacidad on-demand (`ThrottlingException` → 500 en el admin, sobre todo con varios `list()` en paralelo). El authorizer hace `GetItem` O(1) por `PK=APIKEY, SK=<hash>`. (Aprendido en prod: `SourceRepo.list()` aún hace `Scan` de toda la tabla → riesgo a migrar al mismo patrón si reaparece throttling.) <!-- /aprende 2026-06-29 -->

Categorías: `reportes | desaparecidos | acopios | edificios | solicitudes`.

## Comandos

```bash
npm install                                  # instala los 4 workspaces (backend, infra, frontend-public, frontend-admin) <!-- /aprende 2026-06-26 -->
npm test                                      # corre toda la suite (vitest)
npm test --workspace @venezuelahelp/backend   # solo backend
npm run build                                 # compila backend e infra
cd infra && npx cdk synth  --profile VenezuelaHelp   # genera plantilla (no deploy)
cd infra && npx cdk deploy --profile VenezuelaHelp   # despliega
cd infra && npx cdk deploy VenezuelaHelpBotStack --require-approval never   # solo la Lambda del bot (TelegramFn); un cambio de código solo mueve el S3Key, sin tocar IAM <!-- /aprende 2026-06-26 -->
cd infra && npx cdk diff  VenezuelaHelpBotStack   # ver qué cambiaría antes de desplegar
# Deploy COMPLETO (las 7 stacks: Data, Domain, Budget, Scraper, Bot, Frontend, Admin). Antes:
# buildear AMBOS frontends (despliegan desde dist/ pre-construido; el backend bundlea en synth).
# El --profile SSO falla en CDK → exportar creds (ver lesson_cdk-deploy-sso-export-credentials), todo en un comando: <!-- /aprende 2026-06-26 -->
npm run build --workspace frontend-public --workspace frontend-admin
cd infra && eval "$(aws configure export-credentials --profile VenezuelaHelp --format env)" && CDK_DEFAULT_ACCOUNT=720115910277 CDK_DEFAULT_REGION=us-east-1 npx cdk deploy --all --require-approval never
```

## Convenciones

- **TypeScript strict** siempre. Imports con alias `@/` → `backend/src`.
- Variables de entorno validadas con **Zod**. Sin `console.log` en producción → logging estructurado (AWS Powertools).
- **TDD**: test que falla → implementación mínima → test verde → commit. Tests con `vitest`; repos DynamoDB con `aws-sdk-client-mock`; infra con `aws-cdk-lib/assertions`.
- **Conventional Commits con emoji**: `<emoji> <tipo>(<scope>): <descripción imperativa>`.
- **Nunca commitear directo a `main`** — ramas `feat/`, `fix/`, `chore/`. Sin `git push --force` salvo en ramas propias.
- Manejo de errores explícito (nada de swallow silencioso); un fallo por fuente no rompe a las demás.
- **Solo `CLAUDE.md`, no `AGENTS.md`** en este repo (el dueño lo eliminó) — las notas de proyecto van únicamente a `CLAUDE.md`; no recrear `AGENTS.md`. <!-- /aprende 2026-06-26 -->

## AWS

- Perfil SSO: **`VenezuelaHelp`** (cuenta `720115910277`, región `us-east-1`, rol Admin).
- Tabla DynamoDB: `VenezuelaHelp`. DLQ scraper: `venezuelahelp-scraper-dlq`. Token de Telegram en SSM SecureString (Fase 3).
- **Cupos de la cuenta al piso** (cuenta nueva): límite de concurrencia de Lambda = **10** → **no usar `reservedConcurrentExecutions`/provisioned concurrency** (AWS exige dejar ≥10 sin reservar y rechaza la reserva; rompe el deploy). Acotar costo/abuso con throttle de API Gateway + rate-limit por chat + `BudgetStack`. Subir cupos vía AWS Support. <!-- /aprende 2026-06-26 -->
- **Qué stack desplegar según el cambio:** el **`snapshot.json` lo genera el scraper** — `buildSnapshot` se invoca desde `backend/src/scraper/handler.ts`, **no hay Lambda `public-snapshot` aparte** → un cambio en `public-snapshot/snapshot.ts` se despliega con **`VenezuelaHelpScraperStack`**. El **frontend público** se publica con **`VenezuelaHelpFrontendStack`** (un `BucketDeployment` sube `frontend-public/dist` e invalida CloudFront) → **buildear `frontend-public` antes** (`npm run build --workspace @venezuelahelp/frontend-public`). El **admin** es igual: se publica con **`VenezuelaHelpAdminStack`** desde `frontend-admin/dist` → **buildear `frontend-admin` antes**. (El backend NO necesita build previo: las Lambdas se bundlean en `cdk synth`.) Tras desplegar un cambio de snapshot, **el `snapshot.json` en S3 sigue viejo hasta el próximo scrape**: forzar la regeneración con `aws lambda invoke --function-name <ScraperFn> --invocation-type Event /dev/null` (async, 202; ~1–2 min). <!-- /aprende 2026-06-26 -->

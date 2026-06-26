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
- **Conectores enchufables** por fuente: `jsonApi` (consume el endpoint JSON real de cada sitio) y `headless` (Playwright, solo fallback).
- **Frontend público** lee un `snapshot.json` cacheado en S3/CloudFront que el scraper regenera → el tráfico público no pega a Lambda/DynamoDB.
- Servicios: Lambda, DynamoDB (single-table), S3 + CloudFront (×2 + snapshot), API Gateway HTTP API, Cognito (admin), EventBridge, SSM Parameter Store, Bedrock.

> **El scrape es asíncrono.** `POST /scrape` (botón "Scrape ahora" del admin) invoca el Lambda del scraper con `InvocationType: Event` y devuelve **202 `{started:true}`** de inmediato; la extracción sigue en segundo plano (~1–2 min: baja HTML, extrae, llama a Bedrock por cada fuente IA que cambió). **No hay señal de "terminó"**. Por eso el admin muestra un aviso "Scrape iniciado…" al disparar y un botón "Actualizar" en el Dashboard para re-consultar conteos/estado cuando el usuario quiera. No esperar respuesta síncrona con los ítems.

> **Conector IA y modelo de extracción.** Las fuentes `connector:"ai"` se extraen con **tool use** (salida estructurada de Bedrock) usando **Claude Haiku 4.5** (`AI_EXTRACT_MODEL` en `aiConnector.ts`), no el modelo de `CONFIG` (Nova Lite falla con 424 intermitente en tool use sobre páginas grandes). El bot sí usa el modelo barato de `CONFIG`. La extracción corre cada 6 h y solo si el contenido cambió (hash). `htmlToText` recorta a `<main>`/`<article>`/cuerpo para no mandar el chrome de navegación a Bedrock. Páginas muy-JS o con gating por IP (Cloudflare) quedan fuera de alcance (no hay navegador headless). <!-- /aprende 2026-06-26 -->

> **Enrichment (dedup + confianza).** El módulo `backend/src/enrichment/` marca, de forma determinista y sin LLM, duplicados y un nivel de confianza por ítem; corre **dentro de `buildSnapshot`** y las marcas viajan en el `snapshot.json` (no se persisten en DynamoDB). Clave de cluster **por categoría**: `desaparecidos`→nombre, `edificios`/`acopios`→geocell+título, `reportes`/`solicitudes`→firma del **texto** (el título suele ser el nombre del medio) con refuerzo Jaccard (`enrichment.jaccardThreshold`, default 0.7) y "texto <3 tokens → clave única". El más reciente del cluster es canónico. `trust`: `corroborado` (≥2 fuentes) / `no_verificado` (1 fuente) / `sospechoso` (geocerca fuera de VE, blocklist, o título+texto vacíos — "texto corto" NO es sospechoso) / `verificado` (fuentes `trustLevel:"official"`, hoy ninguna). Parámetros en `Config.enrichment` (`CONFIG#GLOBAL`, editable sin deploy; si no hay Item, manda el `DEFAULT_CONFIG` del código). El bot excluye `sospechoso` y prioriza canónicos. <!-- /aprende 2026-06-26 -->

> **Analítica de visitas (beacon).** El frontend público dispara el beacon **una vez por carga** desde un `useEffect(() => sendBeacon(), [])` al montar `frontend-public/src/App.tsx` (`sendBeacon` en `frontend-public/src/track.ts`). Va `POST /api/track` **same-origin vía CloudFront** (sin CORS) → Lambda `TrackFn` → `VisitRepo.record()` (contadores `VSTAT#…` + eventos `VISIT#<fecha>`); el país lo deriva el backend del header `CloudFront-Viewer-Country`. El admin lee con `GET /analytics`. Si la analítica aparece vacía, **verificar que el cliente INVOQUE `sendBeacon()`, no solo lo importe** (fue dead-code una vez, con toda la infra cableada). El público es una sola vista sin router (filtrado client-side), así que el beacon al montar cubre toda visita. <!-- /aprende 2026-06-26 -->

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
| Fuente        | `SOURCE#<id>`     | `META`                    |
| Ítem agregado | `CAT#<categoria>` | `<sourceId>#<externalId>` |
| Log Q&A       | `QA#<chatId>`     | `<ts>`                    |
| Config global | `CONFIG`          | `GLOBAL`                  |

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

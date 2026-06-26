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
- **RAG "pobre"**: recuperación por palabra clave sobre DynamoDB + LLM barato de Bedrock (**Amazon Nova Lite** por defecto, configurable a Claude Haiku). **Sin base vectorial** (OpenSearch Serverless descartado por costo).
- **Conectores enchufables** por fuente: `jsonApi` (consume el endpoint JSON real de cada sitio) y `headless` (Playwright, solo fallback).
- **Frontend público** lee un `snapshot.json` cacheado en S3/CloudFront que el scraper regenera → el tráfico público no pega a Lambda/DynamoDB.
- Servicios: Lambda, DynamoDB (single-table), S3 + CloudFront (×2 + snapshot), API Gateway HTTP API, Cognito (admin), EventBridge, SSM Parameter Store, Bedrock.

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
npm install                                  # instala workspaces (backend, infra)
npm test                                      # corre toda la suite (vitest)
npm test --workspace @venezuelahelp/backend   # solo backend
npm run build                                 # compila backend e infra
cd infra && npx cdk synth  --profile VenezuelaHelp   # genera plantilla (no deploy)
cd infra && npx cdk deploy --profile VenezuelaHelp   # despliega
```

## Convenciones

- **TypeScript strict** siempre. Imports con alias `@/` → `backend/src`.
- Variables de entorno validadas con **Zod**. Sin `console.log` en producción → logging estructurado (AWS Powertools).
- **TDD**: test que falla → implementación mínima → test verde → commit. Tests con `vitest`; repos DynamoDB con `aws-sdk-client-mock`; infra con `aws-cdk-lib/assertions`.
- **Conventional Commits con emoji**: `<emoji> <tipo>(<scope>): <descripción imperativa>`.
- **Nunca commitear directo a `main`** — ramas `feat/`, `fix/`, `chore/`. Sin `git push --force` salvo en ramas propias.
- Manejo de errores explícito (nada de swallow silencioso); un fallo por fuente no rompe a las demás.

## AWS

- Perfil SSO: **`VenezuelaHelp`** (cuenta `720115910277`, región `us-east-1`, rol Admin).
- Tabla DynamoDB: `VenezuelaHelp`. DLQ scraper: `venezuelahelp-scraper-dlq`. Token de Telegram en SSM SecureString (Fase 3).

### Deploy (CDK) <!-- /aprende 2026-06-26 -->

- El SDK de Node de CDK no resuelve bien las credenciales SSO; **exportarlas** antes de desplegar:
  ```bash
  cd infra
  eval "$(aws configure export-credentials --profile VenezuelaHelp --format env)"
  CDK_DEFAULT_ACCOUNT=720115910277 CDK_DEFAULT_REGION=us-east-1 npx cdk deploy <Stack> --require-approval never
  ```
- **Construir cada frontend antes del `cdk synth`/`deploy`** (el `BucketDeployment` usa `Source.asset(.../dist)`): `npm run build --workspace @venezuelahelp/frontend-public` (y `frontend-admin`).
- Stacks (todos llevan prefijo `VenezuelaHelp`): `VenezuelaHelpDataStack`, `VenezuelaHelpScraperStack`, `VenezuelaHelpBotStack`, `VenezuelaHelpFrontendStack`, `VenezuelaHelpAdminStack`. Usa el nombre completo en `cdk deploy` — `cdk deploy BotStack` falla con "No stacks match the name(s)". <!-- /aprende 2026-06-26 -->

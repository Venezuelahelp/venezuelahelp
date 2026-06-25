# VenezuelaHelp — Diseño (Spec)

- **Fecha:** 2026-06-25
- **Estado:** Aprobado (Opción A)
- **Perfil AWS:** `VenezuelaHelp` (cuenta `720115910277`, región `us-east-1`, rol Admin vía SSO)

## 1. Propósito

Plataforma serverless de bajo costo para **agregar información sobre el terremoto de Venezuela** (evento del 25 de junio de 2026) a partir de fuentes públicas de terceros, y exponerla de dos maneras:

1. Un **bot de Telegram** al que la gente le pregunta y responde usando la información agregada.
2. Dos **frontends web**: uno **público** (vista agregada + embudo al bot) y uno **admin/backoffice** (gestión y observabilidad).

Restricción transversal: **el menor costo posible**, porque el proyecto es patrocinado por una persona. Sin costos fijos mensuales; pago por uso.

## 2. Fuentes de datos

Dos fuentes de terceros, **sin acceso ni relación** con sus autores:

- `https://www.sismovenezuela.com/` — dashboard de emergencia que consolida 5 fuentes: reportes, desaparecidos, acopios, edificios, solicitudes. Contenido cargado por JavaScript/API.
- `https://terremotovenezuela.app/` — plataforma de reporte ciudadano con mapa (marcadores: emergencias críticas, suministros, centros de ayuda, cortes de luz, desaparecidos, edificios dañados). Contenido cargado por JavaScript/API.

Ambas son **apps dinámicas**, no HTML estático. La estrategia preferida es **consumir directamente los endpoints JSON/API** que cada app usa por debajo (descubrir vía inspección de tráfico de red). El scraping con navegador headless queda **solo como fallback** si una fuente no expone API consumible.

> **Tarea de implementación #1 (bloqueante para el scraper):** inspeccionar el tráfico de red de ambos sitios y documentar sus endpoints JSON reales, formato de respuesta y categorías. El diseño usa **conectores enchufables** para no reescribir nada según lo que se encuentre.

## 3. Arquitectura (Opción A — "Casi gratis")

Decisión de costo principal:

- **Scraping programado** (EventBridge cada 30 min, configurable) en vez de scrapear en cada mensaje → respuestas instantáneas y barato.
- **RAG "pobre"**: recuperación por **palabra clave** sobre los ítems en DynamoDB + LLM barato de Bedrock. **Sin base vectorial** (se descartó Bedrock Knowledge Base por OpenSearch Serverless ~$350–700/mes). Embeddings en DynamoDB quedan como upgrade futuro opcional (Opción B) sin cambiar la arquitectura.

Componentes serverless: EventBridge, Lambda, DynamoDB (single-table), S3 + CloudFront (×2 frontends + snapshot público), API Gateway HTTP API, Cognito, SSM Parameter Store, Bedrock.

## 4. Estructura de carpetas (monorepo)

```
venezuelahelp/
├── backend/            # Lambdas TypeScript
│   ├── src/
│   │   ├── connectors/     # 1 conector por fuente (jsonApi | headless)
│   │   ├── scraper/        # orquestador + normalización + dedup
│   │   ├── telegram/       # webhook, retrieval, prompt, Bedrock
│   │   ├── admin-api/      # CRUD fuentes, config, logs
│   │   ├── shared/         # repos DynamoDB, tipos, logging (Powertools)
│   │   └── public-snapshot/# genera el JSON público
│   └── package.json
├── frontend-admin/     # Next.js (export estático) — backoffice con Cognito
├── frontend-public/    # Next.js (export estático) — público
├── infra/              # AWS CDK (TypeScript) — todos los stacks
└── docs/
```

Backend y frontends en carpetas separadas (requisito del usuario). `infra/` aparte porque el CDK despliega todo.

## 5. Modelo de datos — DynamoDB single-table `VenezuelaHelp`

Una sola tabla, on-demand (pay-per-request).

| Entidad         | PK                          | SK                 | Atributos clave                                                                                                             |
| --------------- | --------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Fuente (config) | `SOURCE#<id>`               | `META`             | nombre, url, tipo de conector (`jsonApi`\|`headless`), endpoint, mapeo, cadencia, enabled, lastRun, lastStatus, errorMsg    |
| Ítem agregado   | `CAT#<categoria>`           | `<timestamp>#<id>` | categoria, sourceId, externalId, titulo, texto, ubicacion {lat,lng,nombre}, status, raw, contentHash, scrapedAt, lastSeenAt |
| Dedup (GSI1)    | GSI1PK=`HASH#<contentHash>` | GSI1SK=`<id>`      | idempotencia: si el hash existe, se actualiza `lastSeenAt` en vez de duplicar                                               |
| Log Q&A         | `QA#<chatId>`               | `<timestamp>`      | pregunta, respuesta, itemsUsados[], tokensIn, tokensOut, modelo, costoEstimado, flagged                                     |
| Config global   | `CONFIG`                    | `GLOBAL`           | scrapeRateMin, bedrockModelId, systemPrompt, botTriggerMode                                                                 |

- **Categorías** (normalizadas): `reportes`, `desaparecidos`, `acopios`, `edificios`, `solicitudes`. El mapeo fuente→categoría vive en el conector.
- **GSI1** sirve para dedup por `contentHash` (idempotencia del scraper).
- **TTL** opcional en `QA#*` para acotar crecimiento de logs.
- El acceso a DynamoDB se encapsula en repositorios en `backend/src/shared/` (un repo por entidad), con interfaces claras y testeables sin AWS.

## 6. Scraper

- **Trigger:** regla EventBridge `rate(30 minutes)` (valor leído de `CONFIG#GLOBAL.scrapeRateMin`) → Lambda `scraper`. También invocable on-demand desde el admin ("Scrape ahora").
- **Orquestación:** carga fuentes con `enabled=true`, ejecuta el conector correspondiente de cada una de forma **aislada** (un fallo en una fuente no afecta a las demás; se registra `lastStatus=error` + `errorMsg`).
- **Interfaz de conector:** `fetchItems(source): Promise<NormalizedItem[]>`.
  - `jsonApiConnector`: hace fetch al endpoint JSON descubierto y mapea a `NormalizedItem`.
  - `headlessConnector`: Playwright + chromium empaquetado como **imagen container** de Lambda; **solo fallback**.
- **Normalización + dedup:** cada ítem se normaliza al esquema común, se calcula `contentHash` (hash estable del contenido relevante) y se hace **upsert idempotente** vía GSI1 (si el hash ya existe, solo actualiza `lastSeenAt`; si no, inserta).
- **Snapshot público:** al terminar, regenera `snapshot.json` en S3 (ver §9).
- **Resiliencia:** DLQ (SQS) en el Lambda; reintentos acotados; logging estructurado (AWS Powertools).

## 7. Bot de Telegram

- **Secreto:** token de BotFather en **SSM Parameter Store** (SecureString).
- **Webhook:** API Gateway HTTP API → Lambda `telegram`. El Lambda **siempre devuelve 200** a Telegram (evita tormentas de reintentos), incluso ante error interno (responde mensaje de fallback).
- **Política de disparo en grupo (default aprobado):** responde **solo** cuando (a) lo @mencionan, (b) el mensaje es reply a un mensaje del bot, o (c) comando `/pregunta <texto>` (alias `/p`). No responde a cada mensaje del grupo. Configurable vía `CONFIG#GLOBAL.botTriggerMode`.
- **Flujo de respuesta:**
  1. Parsear update y extraer la pregunta.
  2. **Recuperación:** match por palabra clave entre categorías, ponderado por recencia; devuelve top-K ítems.
  3. **Prompt:** contexto (ítems recuperados) + reglas del sistema: responder en **español**, citar la fuente, y decir explícitamente "no tengo ese dato" cuando no haya información relevante (no inventar).
  4. **LLM:** Bedrock, modelo barato por defecto **Amazon Nova Lite** (configurable a Claude Haiku vía `CONFIG`).
  5. Responder al grupo con enlaces a la fuente.
  6. **Loguear** la interacción (pregunta, respuesta, ítems usados, tokens, costo estimado) en `QA#<chatId>`.
- **Guardrails:** solo responde sobre el terremoto; rate-limit por usuario/chat; tamaño máximo de contexto.

## 8. Frontend Admin / backoffice

- Next.js **export estático** en **S3 + CloudFront**. Auth con **Cognito** (Hosted UI o Amplify Auth). Consume `admin-api` (API Gateway + Lambda, authorizer Cognito).
- **Pantallas:**
  - **Dashboard:** conteos por categoría, último scrape (hora/estado), # preguntas hoy, costo LLM estimado.
  - **Fuentes:** listar/crear/editar/activar-desactivar fuentes; tipo de conector; cadencia; botón "Scrape ahora".
  - **Explorador de datos:** buscar/filtrar ítems por categoría; ver raw + normalizado; desactivar ítems malos.
  - **Config del bot:** system prompt, modelo, modo de disparo, cadencia de scraping.
  - **Logs Q&A:** preguntas/respuestas, ítems usados, tokens/costo; marcar respuestas malas.
- **Diseño:** aplicar skills de diseño (impeccable/taste) — limpio, jerárquico y fácil de usar.

## 9. Frontend Público

- Next.js **export estático** en **S3 + CloudFront**, sin auth.
- **Propósito:** vista agregada human-friendly + **embudo al bot de Telegram** (CTA prominente "Pregunta por Telegram").
- **Contenido:** landing explicativa (qué es, cómo usar el bot) + **listado buscable/filtrable** por categoría, **con mapa** (Leaflet + OpenStreetMap, gratis).
- **Optimización de costo:** el público lee un **`snapshot.json` cacheado en S3/CloudFront** que el scraper regenera en cada corrida. El tráfico público **no pega a Lambda ni DynamoDB** → escala prácticamente gratis. La API (Lambda/DynamoDB) la usan solo bot y admin.

## 10. IaC y despliegue

- **AWS CDK (TypeScript)** en `infra/`, organizado en stacks:
  - `DataStack`: DynamoDB, buckets S3 (snapshot + assets), parámetros SSM, DLQ.
  - `ApiStack`: API Gateway HTTP API + Lambdas (`scraper`, `telegram`, `admin-api`, `public-snapshot`) + regla EventBridge.
  - `AuthStack`: Cognito (user pool + app client) para el admin.
  - `FrontendStack`: 2× distribución S3 + CloudFront (admin y público).
- Deploy con `cdk deploy` usando el perfil `VenezuelaHelp`.
- CI/CD queda fuera del MVP.

## 11. Modelos y costo

- **Bedrock** en `us-east-1`. Modelo por defecto **Amazon Nova Lite** (barato), configurable a Claude Haiku desde `CONFIG`.
- **Costo total esperado:** sin costos fijos; ~**$5–15/mes** a volumen moderado, dominado por llamadas a Bedrock. DynamoDB/Lambda/S3/CloudFront caen mayormente en free tier a este volumen.

## 12. Pruebas y manejo de errores

- **Unit:** conectores (normalización + dedup), ranking de retrieval, lógica de disparo del bot, armado de prompt, repositorios DynamoDB (mockeados).
- **Integración:** flujo scrape → store → retrieve.
- **Errores:** aislamiento por fuente; DLQ en scraper; idempotencia por `contentHash`; Telegram siempre 200 con fallback; logging estructurado con Powertools; manejo de errores explícito (sin swallow silencioso).

## 13. Convenciones

- TypeScript strict mode; variables de entorno validadas con Zod; structured logging (Powertools), sin `console.log` en producción; imports con alias `@/` donde aplique; Conventional Commits; nunca commitear directo a `main` (feature branches `feat/`, `fix/`, `chore/`).

## 14. Alcance futuro (fuera del MVP)

- Upgrade a embeddings en DynamoDB (Opción B) si crece el corpus.
- CI/CD.
- Más fuentes de datos (el diseño de conectores ya lo soporta).

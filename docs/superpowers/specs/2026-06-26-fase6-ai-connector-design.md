# VenezuelaHelp — Fase 6: Conector con IA (self-service) — Diseño (Spec)

- **Fecha:** 2026-06-26
- **Estado:** Aprobado
- **Contexto:** Fases 1–5 desplegadas. El admin gestiona las 2 fuentes `jsonApi` existentes. Esta fase permite **agregar fuentes nuevas desde el admin pegando una URL**, y que un conector genérico con IA (Bedrock) extraiga la información.

## 1. Propósito y decisiones

Permitir al patrocinador agregar fuentes de **contenido/noticias** (páginas con texto visible) desde el admin, sin que un desarrollador codifique un conector por cada una. Un conector genérico baja el HTML, lo convierte a texto y usa Bedrock para extraer ítems estructurados en las 5 categorías.

Decisiones tomadas en brainstorming:

- **Tipo de páginas:** contenido/noticias (HTML → texto). **Sin navegador headless** en esta fase (apps muy-JS quedan fuera de alcance).
- **Cadencia:** releer cada **6 h**, y llamar a Bedrock **solo si el contenido cambió** (hash). El scraper sigue corriendo cada 30 min; las fuentes IA se auto-saltan si no toca.
- **Categorías:** la IA **clasifica automáticamente** en las 5 categorías (`reportes | desaparecidos | acopios | edificios | solicitudes`). Campo opcional `extractHint` ("qué buscar") para guiarla.
- **Publicación:** **auto-publica** (sin revisión previa). Si una fuente da basura, el admin la **desactiva o borra**.
- **Defaults de costo:** tope de **~12.000 caracteres** de texto por página enviado a Bedrock; **máx. 50 ítems** por extracción; salida de Bedrock acotada (`maxTokens` ~1500).

## 2. Modelo de datos (extensión)

`Source` (de Fase 1) gana:

- `connector: "jsonApi" | "headless" | "ai"` (se añade `"ai"`).
- `extractHint?: string` — texto guía opcional.
- `lastContentHash?: string` — hash del texto de la última lectura.
- `lastExtractAt?: string` — ISO de la última extracción con Bedrock.

Las fuentes nuevas se crean con `connector:"ai"`, `enabled:true`, `id` = slug del nombre (con sufijo numérico si colisiona) o uuid. Las 2 fuentes existentes (`jsonApi`) no se tocan. `ItemRepo`/`ConfigRepo`/`QaLogRepo` y la clave estable de dedup (`CAT#<cat>/<sourceId>#<externalId>`) se reutilizan sin cambios.

## 3. Conector IA (`backend/src/connectors/aiConnector.ts`)

Funciones puras + inyectables (testeables sin red ni AWS):

- `htmlToText(html: string, maxChars = 12000): string` — quita `<script>/<style>`, tags, colapsa espacios, recorta a `maxChars`.
- `extractItems(text, hint, deps): Promise<NormalizedItem[]>` — llama Bedrock (Converse, modelo de `CONFIG.bedrockModelId`) con un prompt que pide un **array JSON** `[{category, titulo, texto, ubicacion?{nombre,lat?,lng?}}]`; parsea tolerante (extrae el primer bloque `[...]`), **valida con Zod**, descarta ítems con categoría inválida o sin `titulo`, tope 50, mapea a `NormalizedItem` con `externalId = sha256(category+titulo+texto)` y `sourceId` de la fuente.
- `runAiSource(source, now, deps): Promise<{ items: NormalizedItem[]; nextHash: string; nextExtractAt?: string; skipped: boolean }>` — orquesta: fetch HTML → `htmlToText` → hash. Si `hash === source.lastContentHash` **y** `lastExtractAt` < 6 h → `{ items: [], nextHash: hash, skipped: true }` (no llama Bedrock). Si no: `extractItems(...)` → `{ items, nextHash: hash, nextExtractAt: now, skipped: false }`.

`deps` inyectables: `{ fetch, bedrock }` (cliente Bedrock como en `@/telegram/bedrock`, reutilizar `askBedrock` o un wrapper análogo).

Guardas de costo: `maxChars` en texto, `maxTokens` en Bedrock, skip por hash+cadencia, tope de ítems.

## 4. Orquestador (`backend/src/scraper/orchestrator.ts`)

Se extiende `runScrape`:

- Por cada fuente habilitada, **si `connector === "ai"`** → llama `runAiSource(source, now, deps)`; persiste en la fuente `lastContentHash`/`lastExtractAt` (además del `lastRun`/`lastStatus` que ya guarda); upsert de los ítems devueltos. Si `skipped`, igual persiste el `lastRun`/hash pero no cuenta upserts.
- Si `connector !== "ai"` → camino actual (registry connector `getConnector(source.id)`).
- Aislamiento por fuente intacto (un fallo no rompe las demás).

La constante de cadencia (6 h) vive en el aiConnector. `CONFIG.scrapeRateMin` sigue rigiendo el EventBridge (30 min).

## 5. Admin API (`backend/src/admin-api/router.ts`)

Nuevas rutas (tras el JWT authorizer):

- `POST /sources` — body Zod `{ nombre: string(≤80), url: string(url válida), extractHint?: string(≤500) }` → crea Source `{ id: slug, nombre, url, connector:"ai", enabled:true, extractHint }` vía `sourceRepo.put`; 201 con la fuente. id duplicado → sufijo `-2`, `-3`.
- `DELETE /sources/{id}` — `sourceRepo` borra la fuente (añadir `delete(id)` al `SourceRepo`: `DeleteCommand` por `PK=SOURCE#<id>/SK=META`). 200 `{deleted:id}`. (No borra los ítems ya scrapeados; quedan hasta el fast-follow de reconciliación/TTL.)

El handler ya enruta method+path; añadir el match de `POST /sources` y `DELETE /sources/{id}`.

## 6. Admin SPA (`frontend-admin/`)

En la pantalla **Fuentes**:

- Formulario "Agregar fuente": inputs `nombre`, `url`, `qué buscar (opcional)` + botón "Agregar". Llama `api.createSource({nombre,url,extractHint})` → refresca la lista.
- Por cada fuente: botón "Eliminar" (con confirmación) → `api.deleteSource(id)` → refresca.
- `api.ts` gana `createSource(body)` (POST /sources) y `deleteSource(id)` (DELETE /sources/{id}).
- Sigue `DESIGN.md` (institucional, accesible). Las fuentes `connector:"ai"` se distinguen con una etiqueta "IA".

## 7. Infra

`bedrock:InvokeModel`/`Converse` ya está concedido al **bot** Lambda; el **scraper** Lambda ahora también necesita ese permiso (porque corre el aiConnector). Añadir el grant Bedrock al `ScraperStack` (igual que el BotStack). El admin-api Lambda no llama Bedrock (solo crea/borra fuentes), no necesita el grant.

## 8. Manejo de errores

- Fetch de URL falla / no es HTML / Bedrock falla / JSON inválido → la fuente se marca `lastStatus:"error"` + `errorMsg`, se loguea, y **no rompe** las demás (aislamiento existente). Devuelve `[]`.
- JSON de Bedrock tolerante: si no parsea, 0 ítems + error logueado (no crash).
- Validación Zod estricta de cada ítem; los inválidos se descartan silenciosamente (con conteo logueado).

## 9. Pruebas

- `aiConnector`: `htmlToText` (quita tags/script, recorta); `extractItems` con Bedrock mockeado (parseo tolerante, Zod descarta basura, categoría inválida fuera, tope 50, externalId estable); `runAiSource` skip-si-no-cambió y <6h (no llama Bedrock) vs cambió (sí llama) con `fetch` mockeado.
- `orchestrator`: una fuente `ai` corre el aiConnector y persiste hash/extractAt; aislamiento.
- `router`: POST /sources (válido + inválido + id duplicado), DELETE /sources/{id}.
- `SourceRepo.delete`.
- admin `api.ts` createSource/deleteSource; formulario "Agregar fuente" (submit llama createSource; eliminar llama deleteSource).
- infra: ScraperStack tiene el grant Bedrock.

## 10. Convenciones y alcance

TypeScript strict, alias `@/`, Zod, sin `console.log` (Powertools), TDD, Conventional Commits, rama `feat/fase6-ai-connector`.

**Fuera de alcance (fast-follow):** navegador headless para apps muy-JS; revisión/moderación previa de ítems IA; reconciliación/TTL de ítems borrados; rate-limit del bot. No se modifican las fases previas salvo: añadir `"ai"` al union de `connector`, extender el orquestador, añadir rutas al admin-api, y el grant Bedrock al ScraperStack.

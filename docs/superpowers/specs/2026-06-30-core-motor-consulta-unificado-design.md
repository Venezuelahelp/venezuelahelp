# VenezuelaHelp — Motor de consulta unificado (`@venezuelahelp/core`) — Diseño (Spec)

- **Fecha:** 2026-06-30
- **Estado:** Borrador (pendiente de aprobación)
- **Contexto:** Hoy hay **tres caminos de lectura** sobre el mismo `snapshot.json`, cada uno con su propia lógica de consulta, y **divergen**:
  - **Bot Telegram** (`backend/src/telegram/retrieval.ts`, `query.ts`, `agent.ts`): RAG por keyword con ranking ponderado por campo, inferencia de categoría, cuota por categoría, exclusión de sospechosos y preferencia por el canónico del cluster; encima, un router tool-use (LLM) que elige `contar`/`listar`/`buscar` y una redacción Bedrock.
  - **API de datos** (`backend/src/data-api/query.ts`): filtro pobre — `q` como AND de substrings (sin ranking), `near`/`radiusKm`, `category` y paginación por cursor. No infiere categoría, no excluye sospechosos, no colapsa duplicados.
  - **Frontend público** (`frontend-public`): `flatten` propio que colapsa duplicados (`isCanonical`) y filtrado client-side, con su propia noción de criterios.

  Resultado: la misma pregunta puede responderse distinto en el bot, en la API `/v1/*` y en el front. No hay una fuente única de verdad **del motor de consulta** (la fuente de datos sí es única: `snapshot.json`, generado desde DynamoDB).

## 1. Propósito y decisiones

Unificar el **motor de consulta** en una sola pieza compartida, de modo que el bot, la API pública y los frontends respondan **coherente** a la misma consulta — mismo conjunto de ítems y mismos conteos, por construcción.

Decisiones tomadas (brainstorming 2026-06-30):

- **Alcance:** las tres superficies (bot, API, frontend público). El **frontend admin queda fuera** (lee `admin-api`/DynamoDB, no el snapshot).
- **Nivel de calidad:** se **eleva** el motor común al del bot (ranking ponderado + inferencia de categoría + enrichment-aware). La API gana calidad; el frontend público adopta los mismos criterios.
- **Cómo se comparte (camino caliente):** **módulo de código compartido**, no HTTP. En el camino caliente el bot NO llama a la API por red (añadiría latencia, otra invocación Lambda facturada y un punto de fallo en cada pregunta). Responde con el `core` cargado en memoria. Se comparte un paquete TypeScript.
- **API key interna del bot (híbrido):** además del camino caliente por código, se **aprovisiona una API key interna para el bot** y se **guarda a lo interno** (SSM SecureString, igual que el token de Telegram), lista para que el bot pueda consumir la API `/v1/*` por HTTP en usos futuros (p. ej. endpoints que no estén en el snapshot, o ejecución fuera del Lambda del bot). Hoy el bot **no** la usa en el camino caliente. Ver §9.
- **Empaquetado:** nuevo workspace **`@venezuelahelp/core`** (5º workspace del monorepo), **isomorfo y sin dependencias** (ni AWS SDK ni `node:*`): solo lógica pura sobre el objeto `Snapshot` ya cargado en memoria. Cada superficie carga el snapshot a su manera (browser `fetch` desde CloudFront / Lambda `fetch` HTTP / bot gunzip desde S3) y aplica **el mismo motor** encima.
- **Enrichment:** el **cómputo** del enrichment (`clusterize`, `scoreTrust`, `geoCell`) **se queda en `backend`** — corre dentro de `buildSnapshot` sobre `StoredItem` (con `raw`), datos que ni la API ni el frontend ven. Al `core` migran solo los **tipos** de enrichment y las funciones que **consumen** las marcas ya calculadas (`isCanonical`/`trust`/`sourcesCount`/`dupOf`).
- **Compatibilidad:** el **shape del `snapshot.json` no cambia** (el público vivo depende de él). La clave estable de ítem (`CAT#<cat>/<sourceId>#<externalId>`) no cambia.

## 2. Arquitectura

```
                       snapshot.json (S3, gzip)
                       generado por el scraper (DynamoDB → enrichment → S3)
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        │ (gunzip S3)              │ (fetch HTTP)               │ (fetch CDN, browser)
   ┌────▼─────┐              ┌──────▼──────┐              ┌──────▼───────┐
   │   bot    │              │  data-api   │              │ frontend-púb │
   │ telegram │              │   /v1/*     │              │ (Vite/React) │
   └────┬─────┘              └──────┬──────┘              └──────┬───────┘
        │ retrieve()               │ queryItems()               │ searchItems()/countItems()
        └──────────────────────────┼───────────────────────────┘
                                    ▼
                       ┌────────────────────────┐
                       │   @venezuelahelp/core   │  (isomorfo, sin deps)
                       │  searchItems / countItems / listItems / retrieve
                       │  + primitivas (normalize, inferCategories, scoreFields…)
                       └────────────────────────┘
```

El `core` es la **única** implementación del motor. Cada superficie aporta solo su capa propia:

- **bot:** router tool-use (LLM) + redacción Bedrock encima de `retrieve`/`countItems`/`listItems`. Los datos que cita salen del core.
- **API:** serialización JSON + paginación por cursor encima de `searchItems`.
- **frontend:** render encima de `searchItems`/`filterUsable`/`countItems`.

## 3. El workspace `@venezuelahelp/core`

### 3.1 Estructura

```
core/
  package.json        # name "@venezuelahelp/core", "type":"module", sin dependencies, "exports":"./src/index.ts"
  tsconfig.json       # strict; extiende el base; NO incluye libs de DOM ni node
  src/
    types.ts          # Snapshot, PublicItem, Category, CATEGORIES, ItemEnrichment, Ubicacion
    text.ts           # STOP, normalize, stem, keywords
    category.ts       # CATEGORY_SIGNALS, inferCategories, CAT_LABEL
    rank.ts           # FIELD_WEIGHT, scoreFields, rankItems, selectWithQuota, MAX_CATEGORY_FRACTION
    filter.ts         # filterUsable (excluye sospechosos; opción colapsar a canónicos), matchesZona, haversineKm
    search.ts         # searchItems, retrieve
    aggregate.ts      # categoryStat, countItems, listItems, plural
    index.ts          # re-exporta la API pública
  src/__tests__/      # suite vitest propia (isomorfa)
```

Sin dependencias en `package.json`. Imports internos relativos (el alias `@/` de backend **no** aplica aquí).

### 3.2 API pública del módulo

```ts
// Primitivas (re-usadas por todas las superficies)
export function normalize(s: string): string;
export function keywords(q: string): string[];
export function inferCategories(question: string): Set<string>;
export function scoreFields(it: PublicItem, kws: string[]): number;

// Núcleo de búsqueda: filtra + rankea (sin paginar, sin top-k)
export interface SearchParams {
  q?: string;
  category?: string;
  near?: { lat: number; lng: number };
  radiusKm?: number;
  collapseDuplicates?: boolean; // default true: solo canónicos
  includeSuspicious?: boolean; // default false: excluye trust:"sospechoso"
}
export function searchItems(snap: Snapshot, params: SearchParams): PublicItem[];

// Capa bot: top-k con cuota por categoría para el RAG
export function retrieve(
  question: string,
  snap: Snapshot,
  k?: number,
): PublicItem[];

// Agregados deterministas
export function categoryStat(items: PublicItem[]): {
  count: number;
  sources: number;
};
export function countItems(
  snap: Snapshot,
  args: { category?: string; zona?: string },
): string;
export function listItems(
  snap: Snapshot,
  args: { category?: string; zona?: string; limite?: number },
): { category: string; total: number; page: PublicItem[] };
```

`searchItems` consolida la lógica que hoy está dispersa: filtra por `category`, aplica `near`/`radiusKm` (haversine), rankea por keyword con `inferCategories` + `scoreFields`, respeta el enrichment (`filterUsable`). `retrieve` = `searchItems` + `selectWithQuota` + corte a `k` (para el RAG del bot). `queryItems` de la API = `searchItems` + paginación (la paginación por cursor se queda en `data-api`, es detalle de transporte).

### 3.3 Qué NO va al core

- Cómputo del enrichment (`backend/src/enrichment/cluster.ts`, `trust.ts`, `geoCell.ts`) — se queda en backend.
- Lógica de bot específica: `isHelpRequest`/`HELP_PHRASES`, `countAnswer` (formato de texto del bot), el router tool-use (`agent.ts`), `bedrock.ts`, `prompt.ts`. El bot importa las primitivas/`retrieve`/`countItems` del core y mantiene estas piezas.
- Carga del snapshot (cada superficie tiene la suya): `telegram/snapshot.ts`, `data-api/snapshot.ts`, el `fetch` del frontend.

## 4. Migración por superficie

### 4.1 Bot (`backend/src/telegram/`)

- `retrieval.ts`: `normalize`, `keywords`, `stem`, `inferCategories`, `CATEGORY_SIGNALS`, `CAT_LABEL`, `scoreFields`, `retrieve`, `categoryStat`, `plural` pasan a importarse de `@venezuelahelp/core`. Se **queda** en `retrieval.ts`: `isHelpRequest`/`HELP_PHRASES`/`isBareHelpCry` (lógica de bot) y `countAnswer` (formato de respuesta del bot; puede apoyarse en `countItems` del core).
- `query.ts` (`listItems`/`countItems`/`matchesZona`): pasa a usar las versiones del core. Si quedan idénticas, `query.ts` se elimina y el `agent.ts` importa del core.
- `agent.ts`, `bedrock.ts`, `prompt.ts`, `handler.ts`: sin cambios de lógica; solo se ajustan los imports.

### 4.2 API de datos (`backend/src/data-api/query.ts`)

- `queryItems` delega a `core.searchItems` y añade la paginación por cursor (que ya tiene). **Cambio de comportamiento (mejora):** `q` deja de ser AND-de-substrings y pasa a ranking ponderado con inferencia de categoría; se excluyen sospechosos y se colapsan duplicados por defecto (parametrizable por query string si hiciera falta exponerlo). Se documenta en la respuesta/README de la API.
- `handler.ts`: sin cambios (sigue mapeando rutas `/v1/*`).

### 4.3 Frontend público (`frontend-public`)

- Reemplaza su `flatten`/filtrado client-side por `@venezuelahelp/core` (`searchItems`/`filterUsable`/`countItems`). El render de la insignia "En N fuentes" sigue leyendo `sourcesCount` del ítem (sin cambios de UI).
- `frontend-public/package.json` añade `"@venezuelahelp/core": "*"` como dependencia de workspace. El build (`tsc -b && vite build`) transpila el workspace TS sin problema al ser isomorfo y sin deps; los tests del front ya usan `vitest`, igual que el core.

### 4.4 Frontend admin

- **Sin cambios.** Fuera de alcance.

## 5. Coherencia (criterio de éxito)

- Las tres superficies leen el **mismo `snapshot.json`** y aplican el **mismo motor** → **mismo conjunto de ítems y mismos conteos**. El LLM del bot solo redacta sobre los ítems que el core recuperó.
- Ejemplo verificable: "¿cuántos desaparecidos?" → `countItems(core)` da el mismo total en el bot, en `GET /v1/categories` y en el contador del frontend.
- **Desfase temporal admisible:** hasta ~5 min entre superficies por la caché de CloudFront (`max-age=300`) frente al bot leyendo S3. Mismo shape y mismo motor; solo distinta foto temporal del snapshot, verificable con `generatedAt`. Aceptable y documentado.

## 6. Plan de testing

- **Suite propia del `core`** (vitest, isomorfa): migran los tests de lógica pura de `retrieval.test.ts`/`query.test.ts` (ranking, inferencia de categoría, cuota, enrichment-aware, agregados).
- **Tests de paridad** (la red de seguridad de la coherencia): una misma consulta corrida por `retrieve` (bot), `queryItems` (API) y `searchItems` (frontend path) sobre un snapshot de fixture → el conjunto de ítems (por clave estable) debe coincidir.
- **Tests de regresión del bot:** la suite `telegram/` completa sigue verde (handler, agent, retrieval con `isHelpRequest`, etc.).
- **Tests de la API:** `data-api` verifica el nuevo comportamiento de ranking y que la paginación por cursor sigue intacta.
- **Smoke en prod** sobre el snapshot real (~48k ítems): medir que el dedup/ranking del core sobre datos reales se comporta como el bot actual (regla del proyecto: validar heurísticas midiendo el snapshot real, no solo con tests verdes).

## 7. Riesgos y mitigaciones

- **Refactor de monorepo:** nuevo workspace + ajustes de `tsconfig`/paths + que el bundling de CDK `NodejsFunction` (esbuild) y de Vite resuelvan `@venezuelahelp/core`. Mitigación: el core es TS puro sin deps; esbuild/Vite lo bundlean nativamente; se valida con `npm run build` de todos los workspaces antes de cualquier deploy.
- **Romper el shape del snapshot:** el público vivo depende de él. Mitigación: el core **consume** el shape existente; no cambia `buildSnapshot`. Tests de paridad sobre fixture con el shape real.
- **Cambio de comportamiento de la API:** de substring-AND a ranking. Es una mejora pero altera resultados de clientes existentes (si los hay). Mitigación: documentar; el cambio acerca la API a lo que el bot ya hace.
- **Doble fuente temporal del snapshot:** ver §5. Aceptado.

## 8. Fuera de alcance (YAGNI)

- Frontend admin (usa `admin-api`/DynamoDB).
- Cambiar el modelo de carga del snapshot (seguir: bot gunzip S3 / API fetch HTTP / frontend fetch CDN).
- Athena / queries directas sobre S3 (el snapshot sigue siendo un blob; explorar aparte si surge necesidad real de analítica ad-hoc).
- Versionado formal de la API (`/v2`), nuevos endpoints de consulta.

## 9. API key interna del bot (aprovisionamiento)

El bot debe **tener una API key creada y guardada a lo interno para su uso**. Decisión híbrida: no la usa en el camino caliente (responde con el `core` en memoria), pero queda aprovisionada y disponible.

### 9.1 Modelo (reutiliza el existente)

Las API keys ya viven en DynamoDB (partición `APIKEY_PK`, SK = `sha256(rawKey)`, formato `vh_live_*`), creadas por `ApiKeyRepo.create()` que devuelve la raw **una sola vez**; el `authorizer` valida `x-api-key` por hash + status `active` + rate-limit por key. La key del bot es **una key más** de ese modelo, con `consumerName` reservado (p. ej. `"telegram-bot"`).

### 9.2 Aprovisionamiento idempotente

Nuevo módulo `backend/src/data-api/botKey.ts` (o `shared/`), idempotente:

1. Lee SSM SecureString `/venezuelahelp/bot/data-api-key`.
2. **Si existe** → no hace nada (no se regenera; la raw solo se conoce una vez).
3. **Si falta** → `ApiKeyRepo.create({ consumerName: "telegram-bot", email: "internal", requestId: "internal-bot", createdAt })` y guarda la `rawKey` en ese parámetro SSM (`SecureString`, `Overwrite:false`).

Disparo: como paso de bootstrap del scraper (junto a `ensureSeedSources`, que ya corre cada 30 min y tiene acceso a DynamoDB) **o** como `AwsCustomResource` en el `ApiStack` al deploy. Se elige en el plan; preferencia por el bootstrap del scraper para no añadir custom resources.

### 9.3 Lectura desde el bot

Helper `getDataApiKey()` en `backend/src/telegram/secret.ts` (mismo patrón cacheado que `getTelegramToken`): `GetParameter` de `/venezuelahelp/bot/data-api-key` con `WithDecryption:true`. El bot lo expone vía `deps` pero **no lo invoca en el handler hoy** (uso futuro). Se deja un cliente HTTP fino opcional `callDataApi(path, params)` documentado para cuando se necesite.

### 9.4 Permisos IAM

- El componente que aprovisiona (scraper o custom resource) gana `ssm:GetParameter`+`ssm:PutParameter` sobre `/venezuelahelp/bot/data-api-key` y ya tiene RW a la tabla (para `ApiKeyRepo.create`).
- El **Bot Lambda** gana `ssm:GetParameter` sobre `/venezuelahelp/bot/data-api-key` (lectura), análogo al token de Telegram.

### 9.5 Seguridad

- La raw key **nunca** se loguea ni se devuelve por ninguna ruta; vive solo en SSM SecureString y como hash en DynamoDB.
- Revocable desde el admin (`ApiKeyRepo.revoke`) como cualquier otra; rotación = revocar + borrar el parámetro SSM y dejar que el aprovisionamiento recree.

## 10. Fases de implementación (alto nivel)

El plan detallado lo produce `writing-plans`. Esbozo:

1. **Crear `@venezuelahelp/core`**: workspace, `package.json`/`tsconfig`, mover primitivas + `searchItems`/`retrieve`/agregados desde `telegram/`, con su suite de tests migrada (verde).
2. **Migrar el bot** a importar del core; eliminar el código duplicado en `telegram/`; suite `telegram/` verde.
3. **Migrar `data-api`** a `core.searchItems`; tests de la API + nuevo comportamiento de ranking.
4. **Migrar `frontend-public`** al core; build del frontend; verificación visual.
5. **Aprovisionar la API key interna del bot** (§9): módulo idempotente + helper de lectura + permisos IAM; tests del aprovisionamiento (crea si falta, no-op si existe).
6. **Tests de paridad** bot/API/frontend + smoke en prod sobre el snapshot real.
7. **Deploy** (Scraper, Bot, Api y Frontend stacks; Scraper cambia solo si el aprovisionamiento va en su bootstrap) y verificación en vivo.

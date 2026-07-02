# Diseño: Observabilidad admin + mejoras del bot + status en el público

**Fecha:** 2026-07-02 · **Estado:** aprobado por el dueño (conversación 2026-07-02)

Tres PRs independientes que se despliegan al mergear a `main` (GitHub Actions
`deploy.yml`: test → build → `cdk deploy --all`, serializado).

| PR  | Rama                             | Alcance                                                   |
| --- | -------------------------------- | --------------------------------------------------------- |
| 1   | `feat/admin-observabilidad`      | Bloques A y B (admin-api + frontend-admin + orchestrator) |
| 2   | `feat/bot-telemetria-paginacion` | Bloques C y D (telegram)                                  |
| 3   | `feat/public-status-y-compartir` | Bloque E (enrichment/snapshot + frontend-public)          |

Datos medidos en el snapshot vivo (2026-07-02, `generatedAt` 12:58Z): 121.878
ítems (117.913 desaparecidos), snapshot 88 MB / 15 MB gz. El campo `status`
viene **crudo por fuente** (19 valores distintos solo en desaparecidos:
`buscando` 56k, `no_encontrado` 23k, `encontrado` 19k, `safe`, `a_salvo`,
`Ingresado`, `localizado`, …). `lastSeenAt` está presente en el 100 % de los
ítems. La normalización canónica ya existe: `classifyLocated` en
`backend/src/enrichment/matchLocated.ts`.

---

## Bloque A — Admin: visor de Q&A del bot

**Backend** (`backend/src/admin-api/router.ts`):

- `GET /qa-logs/{chatId}?limit=50` → `QaLogRepo.listByChat(chatId, limit)`
  (ya existe; Query por `PK=QA#<chatId>`, sin Scan). Respuesta: array de
  `{ts, pregunta, respuesta, intent?, itemsUsados, tokensIn, tokensOut,
modelo, costoEstimado, flagged}`.

**Frontend** (`frontend-admin/src/components/Users.tsx` + componente nuevo
`QaLogDrawer.tsx`):

- Click en una fila de la tabla de usuarios abre un drawer lateral con las
  últimas 50 interacciones de ese chat: fecha, pregunta, respuesta (truncada,
  expandible), `intent` (badge), tokens in/out, modelo, costo estimado.
- Tabla acotada con `max-height` + scroll interno (convención de listas
  acotadas del proyecto). Botón refresh. Estados loading/error/empty.

## Bloque B — Admin: edad del snapshot + búsqueda de ítems + historial de scrapes

### B1. Edad del snapshot

- `GET /stats` añade `snapshotUpdatedAt` (ISO): `HeadObject` de S3 sobre
  `snapshot.json` (`LastModified` = fin del último scrape, que es la señal
  operativa correcta; `generatedAt` interno se sella al inicio). El Lambda del
  admin gana permiso `s3:GetObject`/`HeadObject` (o `s3:ListBucket` según SDK)
  sobre esa key en `infra`.
- Dashboard: "Snapshot actualizado hace X min", en amarillo si supera
  `2 × scrapeRateMin` (config global).

### B2. Búsqueda de ítems

- `GET /items/search?q=&category=&limit=50` en admin-api, **reutilizando el
  query engine del data-api sobre el snapshot** (`data-api/query.ts` +
  `data-api/snapshot.ts`: HTTP + gunzip + cache 60 s). No toca DynamoDB ni
  materializa categorías completas en memoria del handler.
- Tab nuevo **Buscar** en el admin: input con debounce + select de categoría +
  tabla acotada: título, categoría, fuente, `trust`, `sourcesCount`
  ("En N fuentes"), status crudo, link "Ver original" (`sourceUrl` con
  fallback a la home de la fuente).

### B3. Historial de scrapes

- Repo nuevo `ScrapeRunRepo` (`backend/src/shared/repos/scrapeRunRepo.ts`):
  **partición compartida** `PK=SCRAPERUN`, `SK=<ts ISO>` (patrón APIREQ:
  `Query`, nunca `Scan`), TTL 30 días.
  Campos: `ts, durationMs, sourcesTotal, sourcesOk, sourcesError, created,
updated, unchanged, errors[] (sourceId+mensaje, acotado)`.
- `runScrape()` (orchestrator) persiste una entrada al terminar cada corrida
  (best-effort: un fallo al guardar el historial no rompe el scrape).
- `GET /scrape-runs?limit=10` en admin-api.
- Dashboard: sección "Últimos scrapes" (tabla acotada: fecha, duración,
  fuentes ok/error, ítems creados/actualizados). Resuelve el
  "scrape fire-and-forget": se ve cuándo terminó de verdad la corrida.

## Bloque C — Bot: telemetría de intents + NO_DATA que guía + validación de coords

### C1. Telemetría de intents

- `QaLog` gana campo opcional `intent: string`. Cada rama del handler lo
  reporta: `greeting`, `bare_search`, `pending_search`, `help_cry`,
  `help_guide`, `bare_category`, `agent_saludar|contar|listar|buscar|rechazado`,
  `agent_error_fallback`, `rag_count`, `rag_retrieve`.
- Cuando `answerWithTools` lanza y se degrada a RAG: log estructurado
  (Powertools) con el error + `intent=agent_error_fallback`. Se acaba la
  degradación silenciosa.
- El campo viaja al visor del Bloque A (badge por interacción).

### C2. NO_DATA orientador en el fallback RAG

- La rama del RAG clásico del handler reutiliza el mensaje orientador que ya
  existe en `agent.ts` (extraer a constante/función compartida) en lugar del
  "No tengo ese dato" seco. Coherente con la regla "el bot guía, no corta".

### C3. Validación de coordenadas

- `handleLocation`: rechaza lat/lng fuera de rango (±90/±180) y el par `(0,0)`
  con un mensaje pidiendo reintentar. **Sin geocerca de Venezuela**: la
  diáspora usa el bot desde el exterior.

## Bloque D — Bot: paginación «Ver más»

- `categoryScreen(action, snap, location, offset=0)`: pinta 8 ítems desde
  `offset`; si quedan más, botón **«Ver más»** con `callback_data`
  `more:<action>:<offset+8>` (< 64 bytes).
- `handleCallback` parsea `more:` y reutiliza la ubicación fresca del
  `MenuState` para mantener el orden por distancia en páginas siguientes.
- Si la ubicación caducó entre páginas, cae al comportamiento actual
  (lista sin distancia), sin error.

## Bloque E — Público: status visible + compartir + ordenación + pulido

### E1. `statusClass` en el snapshot (backend, fuente única de verdad)

- El enrichment emite en los ítems de **desaparecidos** un campo nuevo
  `statusClass: "buscando" | "localizado"` calculado con el
  **`classifyLocated` existente** (`matchLocated.ts`); `"otro"` no se emite
  (campo ausente). Sin duplicar el mapa de normalización en el frontend
  (lección del dato canónico hardcodeado).
- Viaja en el snapshot vía `toPublic` (mismo patrón que `sourceUrl`).
  DynamoDB no cambia. Medición esperada: ~80k `buscando` / ~29k `localizado`.
- El tipo público `Item` (frontend y bot) gana `statusClass?`.

### E2. Chip y filtro por status (frontend-public)

- `ItemList`/detalle: chip "✓ Localizado" (verde) o "Buscando" (neutro) cuando
  `statusClass` existe.
- Con categoría activa **desaparecidos**: sub-filtro "Todos / Buscando /
  Localizados" en `FilterBar`. Si el snapshot aún no trae `statusClass`
  (snapshot viejo pre-deploy), el sub-filtro no se muestra (feature-detect).
- El detalle muestra además el status crudo de la fuente cuando existe
  ("Estado según la fuente: …") para todas las categorías.

### E3. Deeplink por ítem

- Ruta `#/item/<sourceId>/<externalId>` (componentes URL-encoded): abre la
  home con el modal de detalle de ese ítem; si no existe en el snapshot,
  toast/aviso "No encontramos esa ficha" y home normal.
- Botón "Copiar enlace" en el modal de detalle (navigator.clipboard con
  fallback). Cerrar el modal restaura `#/`.

### E4. Ordenación

- Selector en la barra de resultados: "Relevancia (orden actual)" /
  "Más recientes" (`lastSeenAt` desc) / "Más corroborados"
  (`sourcesCount` desc, empate por `lastSeenAt`). Client-side, memoizado.

### E5. Pulido

- Debounce ~300 ms en la búsqueda de `FilterBar` (hoy recalcula sobre ~66k
  ítems canónicos por tecla).
- Detalle: "Actualizado: <lastSeenAt>" junto a "Registrado: <firstSeenAt>".
- Empty state con filtros activos: botón "Limpiar filtros".

---

## Transversal

- **TDD** (vitest; repos con `aws-sdk-client-mock`; test desde el workspace
  backend por el alias `@/`).
- Trabajo en **worktrees aislados** partiendo de `origin/main`; no se toca el
  árbol del dueño (`docs/claude-fuentes-conteo`).
- **Stacks afectados:** PR1 → AdminStack (+ Lambda admin-api, IAM S3 Head) y
  ScraperStack (orchestrator/ScrapeRunRepo); PR2 → BotStack; PR3 →
  ScraperStack (enrichment/snapshot) + FrontendStack. Todo lo cubre el
  `cdk deploy --all` del CI. Tras el deploy del PR3, el `statusClass` aparece
  en el snapshot en el siguiente scrape (~30 min máx.); el frontend
  feature-detecta mientras tanto.
- **Errores:** ningún fallo nuevo puede tumbar flujos existentes
  (historial best-effort, HeadObject con try/catch → `snapshotUpdatedAt`
  ausente, paginación degrada a lista sin distancia).

## Fuera de alcance (esta ronda)

- Editar/ocultar ítems desde el admin, métricas de API keys, export CSV,
  i18n del bot, feedback 👍/👎, suscripciones/alertas, reporte ciudadano,
  historial auditable del admin.

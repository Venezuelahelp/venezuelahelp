# Deduplicación entre fuentes y señal de confianza

**Fecha:** 2026-06-26
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Relacionado:** `2026-06-25-venezuelahelp-design.md`, `2026-06-26-fase6-ai-connector-design.md`

## Problema

La data agregada presenta dos defectos que degradan la utilidad para el usuario final:

1. **Duplicación entre fuentes.** El mismo hecho (un edificio dañado, una zona, un desaparecido) puede venir de 2+ fuentes distintas, o de la misma fuente con otro `externalId`. Hoy solo hay dedupe **dentro de una misma fuente** vía `contentHash`; entre fuentes distintas (`sourceId` distinto) son ítems separados. La lista pública y las respuestas del bot se ven infladas y repetidas.
2. **Datos no confiables.** Nombres de personas, zonas o reportes pueden ser falsos, troleo o errores graves. Hoy la fuente entra tal cual (solo truncado y saneado contra prompt-injection); no hay ninguna señal de cuán creíble es un ítem.

## Decisiones de producto (acordadas)

- **Duplicados: solo marcar.** No se fusionan ni se borran. Se conservan todos los ítems originales; los duplicados se marcan para que el front los atenúe/colapse y el bot los desprioritice. Enfoque no destructivo.
- **No confiable: marcar, no ocultar.** Los ítems se siguen mostrando con un **badge de confianza** honesto. No se censura (es información de emergencia), salvo lo que cae en `sospechoso` por reglas duras, que el bot puede excluir y el front degradar.

## Insight central

Si dos fuentes **independientes** reportan el mismo hecho, esa corroboración es **a la vez** la señal de "duplicado" y la mejor señal barata de "esto probablemente es verdad". Un único cálculo (agrupar ítems del mismo hecho) alimenta ambas marcas. La veracidad absoluta (¿este nombre existe de verdad?) es imposible de verificar sin fuente autoritativa, así que **no se promete**: se entrega un _score de confianza_ explicable.

## Mecanismo (Enfoque A + refuerzo + reglas)

Detección determinística del "mismo hecho", sin base vectorial y a costo ~$0 de CPU:

- **A — Clave de cluster determinística** (base). Cada ítem obtiene un `clusterKey`. Ítems con la misma clave = mismo hecho.
- **B — Refuerzo textual difuso.** Cuando no hay geo ni persona, se compara la firma de tokens del título con Jaccard; firmas con similitud ≥ umbral se funden al mismo `clusterKey`.
- **Reglas de plausibilidad** para la marca de confianza (geocerca de Venezuela, campos mínimos, longitudes, blocklist de troleo, fechas).

Se descarta para v1 un LLM de agrupación por lote en cada scrape (rompe la restricción "casi gratis"); queda documentado como evolución futura si hay presupuesto.

## Arquitectura — enriquecimiento dentro de `buildSnapshot`

**Hallazgo que define el diseño:** los dos consumidores que necesitan las marcas
—frontend público y bot de Telegram— leen **el mismo `snapshot.json`** de S3
(`telegram/snapshot.ts` hace `GetObject` de `snapshot.json`, no consulta DynamoDB).
El admin solo **cuenta** ítems (`admin-api/router.ts`), no los lista con marcas.

Por lo tanto el enriquecimiento se calcula **al construir el snapshot**, que ya
carga todos los ítems por categoría. Las marcas viajan dentro del `snapshot.json`.
**No se persisten en DynamoDB** (sería YAGNI: ningún consumidor las leería desde
la tabla). El scraper ya encadena `runScrape()` → `buildSnapshot()` en el mismo
Lambda (`scraper/handler.ts`), así que no hace falta ningún paso ni Lambda nuevo.

```
buildSnapshot(now):
  config = configRepo.get()                       // incluye parámetros de enrichment
  para cada categoría:
    items = itemRepo.listByCategory(cat)           // ya existe
    enriched = enrichItems(items, config)          // ★ NUEVO: marca cada ítem
    categories[cat] = enriched.map(toPublic)       // toPublic ya quita `raw`
  PutObject(snapshot.json)                          // ahora con marcas
```

**Módulo aislado `backend/src/enrichment/`** con responsabilidad única y **funciones
puras** (reciben ítems + config → devuelven ítems marcados; sin DynamoDB, sin red,
sin reloj). Testeable en aislamiento con tablas de entrada/salida.

### Trade-offs asumidos

- **Recálculo en cada snapshot:** el enriquecimiento se recalcula cada vez que se
  regenera el snapshot. Es determinístico y O(n)–O(n²) por categoría con n de
  cientos → trivial en CPU. Se evita así toda complejidad de persistencia,
  reescritura condicional e idempotencia en DynamoDB.
- **Sin GSI ni campos nuevos en la tabla:** clusterización en memoria por
  categoría. Coherente con la arquitectura single-table actual.

## Modelo de datos

Las marcas se agregan **al ítem del snapshot** (no a `StoredItem` en DynamoDB).
El snapshot público hoy expone `Omit<StoredItem, "raw">`; se extiende con un bloque
de campos derivados:

```typescript
interface ItemEnrichment {
  clusterKey: string; // clave canónica del "mismo hecho"
  isCanonical: boolean; // true = representante del cluster; false = duplicado
  dupOf?: string; // si !isCanonical → SK ("sourceId#externalId") del canónico
  sourcesCount: number; // nº de fuentes DISTINTAS en el cluster (corroboración)
  trust: "verificado" | "corroborado" | "no_verificado" | "sospechoso";
  trustReasons: string[]; // explica el badge y ayuda al admin
}

// El ítem del snapshot pasa a ser: Omit<StoredItem,"raw"> & ItemEnrichment
```

### Cálculo de `clusterKey` (por categoría, determinístico)

- **Geo presente** → `geoCell(lat, lng)` (rejilla ~1.2 km, redondeo de coordenadas,
  sin dependencia externa) + `slug(nombre_zona)`.
- **Persona (categoría `desaparecidos`)** → `slug(nombre normalizado: NFD, sin
tildes, sin dobles espacios)` tomado del título + `geoCell` de la ubicación si existe.
- **Sin geo ni persona** → firma de tokens del título (top-N palabras
  significativas, sin stopwords, ordenadas). Refuerzo B: firmas con Jaccard ≥
  umbral se funden al mismo `clusterKey`.
- **Canónico del cluster** = mayor `sourcesCount` → desempate por `lastSeenAt` más
  reciente → desempate final por SK (orden estable). Los demás: `isCanonical=false`,
  `dupOf = SK(canónico)`. `sourcesCount` = nº de `sourceId` distintos en el cluster.

### Cálculo de `trust` (reglas en orden)

1. **`sospechoso`** si falla plausibilidad dura (con razón en `trustReasons`): geo
   fuera de la geocerca de Venezuela; `titulo` vacío o `texto` < `minTextLen`; match
   de blocklist de troleo/spam.
2. **`corroborado`** si `sourcesCount ≥ 2`.
3. **`no_verificado`** si `sourcesCount == 1` y pasa plausibilidad. ← default honesto.
4. **`verificado`** reservado para fuentes oficiales (campo opcional
   `source.trustLevel: "official"`; hoy ninguna lo es; queda listo para Protección
   Civil/bomberos a futuro). En v1 no hay fuentes oficiales → nunca se emite, pero
   la rama existe.

### Configuración (en `Config`, editable sin deploy)

Se extiende `Config` (`CONFIG#GLOBAL` en DynamoDB) con un bloque `enrichment` y sus
defaults en `DEFAULT_CONFIG`. Editable vía el repo de config sin redeploy:

- `geocerca`: bounding box de Venezuela `{ latMin, latMax, lngMin, lngMax }`.
  Default: `{ latMin: 0.6, latMax: 12.2, lngMin: -73.4, lngMax: -59.8 }`.
- `blocklist`: términos de troleo/spam (lista de strings, default acotado).
- `jaccardThreshold`: umbral del refuerzo B. Default `0.6`.
- `geoCellSize`: tamaño de celda en grados. Default `0.01` (~1.1 km en latitud).
- `minTextLen`: longitud mínima de `texto`. Default `10`.

## Consumidores

- **Snapshot público:** cada ítem incluye `trust`, `trustReasons`, `sourcesCount`,
  `isCanonical`, `dupOf`. El front muestra badge de confianza y atenúa/colapsa
  `isCanonical=false`. (El cambio de UI del front queda fuera de este plan backend;
  los campos quedan disponibles en el JSON.)
- **Bot Telegram:** en el retrieval prioriza `isCanonical` y `corroborado`; excluye
  `sospechoso`; añade "fuentes: N" al contexto para responder con la cautela debida.
- **Admin:** sin cambios en v1 (solo cuenta). Puede leer el snapshot si necesita
  inspeccionar marcas.

## Testing (TDD, vitest)

Módulo puro → tablas de entrada/salida sin mocks.

- **`geoCell()`**: dos coordenadas en la misma celda → misma clave; coordenadas
  separadas > tamaño de celda → claves distintas.
- **`clusterize()`** (dentro de `enrichItems`): mismo geoCell+zona → mismo cluster;
  persona con/sin tilde → mismo cluster (NFD); Jaccard funde títulos similares;
  ítems distintos no colisionan; canónico = más fuentes → más reciente; `sourcesCount`
  cuenta `sourceId` distintos.
- **`scoreTrust()`**: 1 fuente → `no_verificado`; 2+ fuentes distintas →
  `corroborado`; geo fuera de VE → `sospechoso` con razón; texto corto → `sospechoso`;
  blocklist → `sospechoso`. Tabla de casos borde.
- **`enrichItems()`**: integra cluster+trust sobre una lista; preserva los campos
  originales del ítem; no muta la entrada.
- **Snapshot**: test extendido — el snapshot incluye los campos nuevos por ítem y
  lee la config.
- **Bot retrieval**: prioriza canónicos/corroborados y excluye sospechosos.
- **Bot prompt**: el contexto incluye la nota de fuentes/confianza.
- **Regresión**: suite actual de `itemRepo`/orchestrator/snapshot/retrieval verde
  (campos aditivos y opcionales; `itemRepo` no cambia).

## Fuera de alcance (v1)

- Fusión/merge de ítems en uno canónico (se eligió "solo marcar").
- Ocultar bajo umbral o cola de moderación humana (se eligió "marcar").
- LLM de agrupación o verificación semántica en la ingesta.
- GSI, campos nuevos en la tabla, o persistir marcas en DynamoDB.
- Verificación de veracidad contra una fuente autoritativa externa.
- Cambios de UI en el frontend público (los campos quedan en el JSON; consumirlos
  visualmente es un trabajo de front aparte).
- UI de admin para editar los parámetros de enrichment (se editan vía el repo de
  config; el endpoint/forma de edición existente se reutiliza si aplica).

## Evolución futura (documentada, no implementada)

- LLM de agrupación por lote para clusters que A+B no capturan (si hay presupuesto).
- Fuentes oficiales con `trustLevel: "official"` → `verificado`.
- Persistir marcas en `StoredItem` si el admin necesita auditar/filtrar desde DynamoDB.
- Fusión opcional configurable si el "solo marcar" no basta en producción.

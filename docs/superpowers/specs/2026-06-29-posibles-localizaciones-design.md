# Posibles localizaciones — cruce desaparecido ↔ localizado/hospital

**Fecha:** 2026-06-29 (revisado 2026-06-30)
**Estado:** Diseño aprobado, pendiente de plan de implementación.

> **Revisión 2026-06-30 (alcance ampliado).** Dos deltas sobre el diseño original, marcados con **▲ DELTA** abajo:
>
> 1. **Corroboración por varias fuentes ("azul").** El match distingue si la localización está respaldada por **una** fuente (verde) o por **varias** (azul) → nuevo `locatedSourcesCount`.
> 2. **Bot de Telegram (entra al alcance).** El bot, al buscar un nombre, avisa si hay coincidencia de localización y dice si está corroborada por varias fuentes. Sale de "Fuera de alcance".

## Problema

La categoría `desaparecidos` del snapshot mezcla dos poblaciones:

- **Buscando** — personas reportadas como desaparecidas por sus familias.
- **Localizado / en hospital** — personas reportadas como halladas, a salvo, o ingresadas en un centro de salud (incluye la fuente `pacientesve`, que lista nombre + hospital + condición).

Hoy nadie cruza ambas. Si una persona que su familia reporta como desaparecida aparece en una lista de pacientes de un hospital o en un reporte de "localizado" de otra fuente, **ese dato existe en la plataforma pero nunca se conecta**. El objetivo es detectar esas coincidencias y avisarlas en el frontend público.

### Medición sobre el snapshot real (2026-06-29)

| Métrica                                                  | Valor        |
| -------------------------------------------------------- | ------------ |
| Desaparecidos totales                                    | 45.461       |
| → buscando                                               | ~25.584      |
| → localizados / en hospital                              | ~16.732      |
| Nombres en ambos sets (≥2 tokens)                        | 1.398        |
| → cross-source (buscado en fuente A, hallado en B)       | 978          |
| → con señal corroborante dura (cédula/teléfono/hospital) | 127          |
| → nombre fuerte (3+ tokens)                              | 350          |
| Ítems con cédula                                         | 5.999 (~13%) |

Casos reales verificados en la muestra: persona buscada en "Hospital Pérez Carreño" que aparece localizada en el mismo hospital por otra fuente; mismo teléfono de contacto en ambos lados; misma cédula; misma dirección.

## Restricción ética (define el diseño)

El match por nombre **a secas es ruidoso**: ~1.063 de los 1.398 son nombres de 2 tokens ("garcia jose") → homónimos garantizados. **Anunciar a una familia que su desaparecido fue localizado por un homónimo es el peor fallo posible de la plataforma.**

Decisiones derivadas:

- Solo se muestran **coincidencias confirmadas** (definición abajo). Las "posibles" de 2 tokens sin corroboración **no se muestran**.
- El copy **nunca afirma**. Es siempre "coincidencia automática, verifica con la fuente".
- **Los fallecidos quedan fuera del MVP.** El status `deceased` (sos-en-venezuela, ~29) no entra: anunciar un fallecimiento por coincidencia de nombre es un riesgo que no se asume aquí.

## Arquitectura

Sin infraestructura nueva. El cruce se calcula **dentro de `buildSnapshot`** (mismo patrón que `backend/src/enrichment/`: determinista, sin LLM, no se persiste en DynamoDB) y el resultado viaja en el `snapshot.json`. El frontend público lo consume del JSON cacheado → el tráfico público no pega a Lambda/DynamoDB.

> Nota de coordinación: hay WIP en paralelo en `enrichment/cluster.ts` (rama `feat/dedup-cross-source-publico`). El módulo nuevo de matching debe ser independiente de ese cluster para evitar acoplar ambos trabajos; reusa los helpers de normalización si ya existen, pero vive en su propio archivo.

### Componente 1 — Motor de cruce (`backend/src/enrichment/matchLocated.ts`)

Función pura sobre la lista de ítems `desaparecidos` ya normalizados.

1. **Clasificación** `buscando | localizado | otro` por mapa explícito de `status` conocidos + pistas de texto:
   - `buscando`: `no_encontrado`, `missing`, `Familia buscando`, `Sin familia localizada`, `Por localizar`, y `None` de fuentes cuyo default es buscar (`venezuela-te-busca`, `terremotovenezuela`).
   - `localizado`: `encontrado`, `safe`, `A Salvo`, `Ingresado/Ingresada/Ingresado/a`, `Atendido`, `Localizado`.
   - `otro` (excluido): `deceased`, y status no reconocidos.
2. **Clave de nombre**: NFKD → quitar acentos → minúsculas → solo `[a-z ]` → tokens de longitud >1 → **ordenados** (orden-insensible, resuelve "Cardozo Carla" = "Carla Cardozo").
3. **Indexar** los `localizado` por clave de nombre.
4. Para cada `buscando`, buscar `localizado` con la misma clave y emitir match **solo si**:
   - nombre de **3+ tokens** y el localizado es de **otra fuente** (cross-source), **o**
   - comparte una **señal dura**: misma cédula, mismo teléfono, o mismo hospital normalizado (extraídos del `texto` por regex).
5. **Dedup**: 1 match por persona buscada. Si hay varios localizados candidatos, preferir el de señal más fuerte (cédula > teléfono > hospital > nombre-fuerte) y, a igualdad, el más reciente.
6. **▲ DELTA — Corroboración.** Antes de quedarse con el localizado canónico, agrupar **todos** los localizados que coinciden con esa clave y contar las **fuentes distintas** (`sourceId`) que lo respaldan → `locatedSourcesCount`. El canónico (más fuerte / más reciente) sigue siendo el que se muestra en detalle, pero el conteo refleja toda la corroboración. `locatedSourcesCount ≥ 2` ⇒ **azul** ("localización corroborada por varias fuentes"); `= 1` ⇒ **verde** ("posible localización").

### Componente 2 — Forma en el snapshot

Campo nuevo top-level `matches: LocatedMatch[]` en `public-snapshot/snapshot.ts`. No toca DynamoDB.

```ts
interface LocatedMatch {
  nombre: string;
  signal: "cédula" | "teléfono" | "hospital" | "nombre-fuerte";
  locatedSourcesCount: number; // ▲ DELTA: fuentes distintas que respaldan la localización (≥2 ⇒ azul)
  missing: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
  };
  located: {
    // canónico (señal más fuerte / más reciente) que se muestra en detalle
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
    hospital?: string;
    sources: string[]; // ▲ DELTA: todos los sourceId que reportan localizado para este nombre
  };
}
```

### Componente 3 — UI pública: sección "Posibles localizaciones"

Bloque nuevo en `frontend-public`. **Lista acotada con `max-height` + scroll interno** (regla del proyecto: nada de scroll infinito), sobre los tokens de diseño existentes.

Cada tarjeta:

- Encabezado con el nombre y la señal que respalda el match.
- Dos columnas: **Reportado como buscado** ↔ **Reportado como localizado** (texto de cada lado + fuente).
- **"Ver original"** a ambas fuentes (`sourceUrl`, con fallback a la home de la fuente como en el resto del público).
- Aviso fijo de encuadre (no afirmar; ver copy abajo).

**▲ DELTA — Color por corroboración.** Cada tarjeta lleva un indicador de color según `locatedSourcesCount`:

- `= 1` → **verde**, etiqueta "Posible localización" (una sola fuente la reporta localizada).
- `≥ 2` → **azul**, etiqueta "Localización corroborada por N fuentes" (varias páginas coinciden — mayor confianza).

El color es solo una señal de confianza relativa; **no cambia el copy de "no es confirmación"** (un homónimo puede repetirse en varias fuentes). Reusar los tokens de color existentes del público; nada de scroll infinito.

Si `matches` viene vacío, la sección no se renderiza.

### Copy de encuadre (fijo, visible en la sección)

> "Estas son coincidencias automáticas por nombre entre reportes de personas buscadas y reportes de personas localizadas o ingresadas en hospitales. **No son confirmaciones.** Verifica siempre directamente con las fuentes antes de sacar conclusiones."

### ▲ DELTA — Componente 4: aviso en el bot de Telegram (reactivo al buscar)

El bot **no añade un menú nuevo**: enriquece la respuesta de búsqueda por nombre que ya existe.

- El snapshot que el bot ya lee (`telegram/snapshot.ts`) ahora trae `matches`. Al cargarlo, el bot indexa los `LocatedMatch` por **clave de nombre** (la misma normalización ordenada del motor) → lookup O(1).
- En la **rama "buscar"** (que ya hace short-circuit determinista por match de título), tras hallar la ficha del buscado, si su clave de nombre tiene un `LocatedMatch` se **añade un bloque de aviso** a la respuesta, p. ej.:

  > ⚠️ _Coincidencia automática (no confirmada):_ esta persona fue **reportada como localizada** en _[fuente]_.
  > **Corroborado por N fuentes.** ← solo si `locatedSourcesCount ≥ 2`
  > Verifica directamente con la fuente antes de sacar conclusiones.

- Botón inline **"🔗 Ver original"** a `located.sourceUrl` (fallback a la home de la fuente), como en `cards.ts`.
- **Mismas exclusiones que el público:** fallecidos fuera, solo matches confirmados, nunca afirma. El bloque solo aparece cuando el nombre buscado tiene match; si no, la respuesta es la de hoy.
- Si `matches` no está en el snapshot (snapshot viejo) el bot se comporta como hoy (campo opcional, sin romper).

## Manejo de errores

- Un ítem con `titulo` vacío o clave de nombre <2 tokens se ignora (no entra al índice ni genera match).
- Un fallo del motor de matching **no debe romper `buildSnapshot`**: si lanza, se registra y `matches` queda `[]` (la plataforma sigue funcionando sin la sección).
- Regex de cédula/teléfono/hospital tolerantes a formato; si no extraen nada, simplemente no hay señal dura (el match solo sobrevive por nombre-fuerte cross-source).

## Testing

TDD con `vitest` (`backend/src/enrichment/__tests__/matchLocated.test.ts`):

- **Deben matchear**: mismo hospital; misma cédula; mismo teléfono; nombre 3+ tokens cross-source; nombre con orden invertido.
- **No deben matchear**: nombre de 2 tokens sin corroboración (homónimo); fallecido (`deceased`); buscado y localizado de la **misma** fuente sin señal dura (ruido intra-fuente); título vacío.
- **Dedup**: una persona buscada con dos localizados candidatos → un solo match, con la señal más fuerte.
- **▲ Corroboración**: un buscado con localizados en **dos fuentes distintas** → `locatedSourcesCount === 2` (azul); con una sola fuente → `1` (verde); dos localizados de la **misma** fuente no inflan el conteo (se cuentan `sourceId` distintos).
- **▲ Bot**: dado un snapshot con un `LocatedMatch`, buscar ese nombre produce el bloque de aviso con la línea "Corroborado por N fuentes" solo cuando `locatedSourcesCount ≥ 2`; un nombre sin match no añade bloque.

Validación final: **smoke sobre el snapshot real** (regla del proyecto de validar heurísticas en prod), midiendo cuántos matches confirmados produce y revisando manualmente una muestra antes de exponerlo.

## Fuera de alcance (YAGNI)

- Badge en la ficha del desaparecido (se descartó en favor de la sección dedicada).
- Coincidencias de fallecidos.
- Matching por similitud difusa de tokens (Jaccard parcial); el MVP usa igualdad de clave + corroboración. Se puede extender luego si la cobertura se queda corta.
- **Notificación push proactiva** del bot (mandar mensaje sin que el usuario pregunte). El bot solo avisa **reactivamente** al buscar un nombre (Componente 4); el push proactivo sigue fuera de alcance.
- Marcar/afirmar el match en la **ficha del buscado** (público o bot): se mantiene la sección/bloque aparte que nunca afirma.

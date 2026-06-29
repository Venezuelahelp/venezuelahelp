# Posibles localizaciones — cruce desaparecido ↔ localizado/hospital

**Fecha:** 2026-06-29
**Estado:** Diseño aprobado, pendiente de plan de implementación.

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

### Componente 2 — Forma en el snapshot

Campo nuevo top-level `matches: LocatedMatch[]` en `public-snapshot/snapshot.ts`. No toca DynamoDB.

```ts
interface LocatedMatch {
  nombre: string;
  signal: "cédula" | "teléfono" | "hospital" | "nombre-fuerte";
  missing: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
  };
  located: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
    hospital?: string;
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

Si `matches` viene vacío, la sección no se renderiza.

### Copy de encuadre (fijo, visible en la sección)

> "Estas son coincidencias automáticas por nombre entre reportes de personas buscadas y reportes de personas localizadas o ingresadas en hospitales. **No son confirmaciones.** Verifica siempre directamente con las fuentes antes de sacar conclusiones."

## Manejo de errores

- Un ítem con `titulo` vacío o clave de nombre <2 tokens se ignora (no entra al índice ni genera match).
- Un fallo del motor de matching **no debe romper `buildSnapshot`**: si lanza, se registra y `matches` queda `[]` (la plataforma sigue funcionando sin la sección).
- Regex de cédula/teléfono/hospital tolerantes a formato; si no extraen nada, simplemente no hay señal dura (el match solo sobrevive por nombre-fuerte cross-source).

## Testing

TDD con `vitest` (`backend/src/enrichment/__tests__/matchLocated.test.ts`):

- **Deben matchear**: mismo hospital; misma cédula; mismo teléfono; nombre 3+ tokens cross-source; nombre con orden invertido.
- **No deben matchear**: nombre de 2 tokens sin corroboración (homónimo); fallecido (`deceased`); buscado y localizado de la **misma** fuente sin señal dura (ruido intra-fuente); título vacío.
- **Dedup**: una persona buscada con dos localizados candidatos → un solo match, con la señal más fuerte.

Validación final: **smoke sobre el snapshot real** (regla del proyecto de validar heurísticas en prod), midiendo cuántos matches confirmados produce y revisando manualmente una muestra antes de exponerlo.

## Fuera de alcance (YAGNI)

- Badge en la ficha del desaparecido (se descartó en favor de la sección dedicada).
- Coincidencias de fallecidos.
- Matching por similitud difusa de tokens (Jaccard parcial); el MVP usa igualdad de clave + corroboración. Se puede extender luego si la cobertura se queda corta.
- Notificación push / por bot de Telegram de una coincidencia (posible fase futura).

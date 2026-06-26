# Diseño — Menú de navegación del bot de Telegram

- **Fecha:** 2026-06-26
- **Estado:** Aprobado para planificar
- **Fase:** Esqueleto de navegación (los datos estructurados ricos se difieren a una fase posterior)
- **Relacionado:** `docs/superpowers/specs/2026-06-25-venezuelahelp-design.md`, `docs/superpowers/plans/2026-06-26-fase3-telegram.md`

## 1. Contexto y problema

Hoy el bot de Telegram es un único flujo conversacional: `webhook → message.text → RAG por keyword sobre snapshot.json → Bedrock → respuesta de texto`. El usuario solo puede interactuar escribiendo preguntas en lenguaje natural.

Se quiere añadir un **menú guiado con botones** para que personas en una emergencia accedan a la información sin tener que formular una pregunta: aportar insumos, voluntariado, y un bloque "NECESITO AYUDA" con emergencias médicas, refugios, distribución de víveres y rescate animal.

### El choque con el modelo de datos actual

La propuesta original asume un modelo de datos **mucho más rico** del que existe. Cada ítem del `snapshot.json` hoy tiene solo (`backend/src/shared/types.ts:17`):

```
category · sourceId · externalId · titulo · texto · ubicacion?(lat,lng,nombre) · status? · trust · ...enrichment
```

Y las categorías son únicamente: `reportes | desaparecidos | acopios | edificios | solicitudes`.

No existen como datos estructurados: teléfonos, horarios, capacidad de albergues, inventario de suministros, categoría de animales/veterinarias, ni un flag de "validado por admin" (solo niveles `trust` automáticos: `verificado | corroborado | no_verificado | sospechoso`). La categoría `acopios` agrupa indistintamente centros de donación, suministros y refugios.

### Decisiones de alcance (acordadas en brainstorming)

1. **Esqueleto ahora, datos después.** Se construye la navegación con botones + ubicación + números oficiales (constantes), mostrando lo que sí existe. Teléfonos por ítem, capacidad, inventario y categoría de animales se difieren.
2. **Pedir ubicación y ordenar por cercanía.** El bot solicita la ubicación nativa de Telegram y ordena los ítems con coordenadas por distancia; los que no tienen geo van al final.
3. **Sub-filtrar `acopios` por palabras clave** para distinguir Aportar insumos / Refugios / Víveres.
4. **Set nacional fijo** de números de emergencia de Venezuela, como constantes en el código (con placeholders a rellenar).
5. **El menú es aditivo**: la búsqueda libre RAG+Bedrock actual sigue intacta.
6. **🐾 Animales** muestra un mensaje "Próximamente" (no hay categoría).

## 2. Arquitectura

El bot ya recibe de Telegram tipos de update que hoy ignoramos. El menú los activa:

```
update ─┬─ callback_query      → menu router        → submenú / lista de tarjetas
        ├─ message.location    → render con cercanía → lista ordenada por distancia
        └─ message.text ─┬─ /start | "menu" | "menú" → bienvenida + teclado inline
                         └─ pregunta libre           → RAG + Bedrock (flujo actual, intacto)
```

**Principio de costo:** la navegación del menú es _data-only_ y **no llama a Bedrock**. Lee el mismo `snapshot.json` ya cacheado en memoria (`loadSnapshot`). Solo la pregunta de texto libre consume tokens. Esto preserva la restricción transversal de costo del proyecto.

**Principio de aislamiento:** la lógica del menú vive en módulos puros y pequeños, separados del `handler`. El `handler` solo orquesta (decide qué rama tomar y hace el I/O); el árbol del menú, el render y la geometría son funciones puras testeables sin mocks de red.

## 3. Componentes

### Módulos nuevos

| Archivo                                 | Responsabilidad                                                                                                                                                                                                    | Dependencias                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `backend/src/telegram/menu.ts`          | Árbol del menú + router. Dado `callbackData`, `snapshot` y `userLocation?`, devuelve `{ text, replyMarkup }`. **Puro.**                                                                                            | `cards.ts`, `geo.ts`, `emergencyInfo.ts`, tipos |
| `backend/src/telegram/cards.ts`         | Renderiza `PublicItem[]` como tarjetas de texto: título, insignia de `trust`, extracto de `texto`, enlace "📍 Cómo llegar" a Google Maps (si hay `ubicacion`), distancia (si hay ubicación del usuario). **Puro.** | `geo.ts`, tipos                                 |
| `backend/src/telegram/geo.ts`           | `haversineKm(a, b)` y `sortByDistance(items, from)`. **Puro.**                                                                                                                                                     | —                                               |
| `backend/src/telegram/emergencyInfo.ts` | **Constantes**: números nacionales (formato `tel:`) y enlaces de X. Placeholders con `TODO`. **Puro.**                                                                                                             | —                                               |
| `backend/src/telegram/menuState.ts`     | Persiste por chat la `pendingCategory` y la última ubicación (`lat`, `lng`, `ts`). Lee/escribe en DynamoDB.                                                                                                        | `ddb`, `keys`                                   |

### Extensiones a lo existente

| Archivo                               | Cambio                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/telegram/telegramApi.ts` | `sendMessage` acepta `replyMarkup?` opcional (inline keyboard, reply keyboard con `request_location`, o `remove_keyboard`). Nueva función `answerCallbackQuery(token, callbackQueryId)`. |
| `backend/src/telegram/types.ts`       | `TgUpdate` gana `callback_query?`. `TgMessage` gana `location?: { latitude, longitude }`. Nuevos tipos `TgCallbackQuery`, `InlineKeyboardMarkup`, `ReplyKeyboardMarkup`.                 |
| `backend/src/telegram/handler.ts`     | Ramifica el update en 3 casos: `callback_query`, `message.location`, `message.text`. La rama de texto distingue comando de menú vs pregunta libre.                                       |

## 4. El menú

### Pantalla 1 — Bienvenida

Se dispara con `/start`, deep link, o si el usuario escribe `menu`/`menú`. Muestra el texto de bienvenida (reusa el `WELCOME` actual, levemente adaptado) + teclado inline:

```
┌──────────────────────┬──────────────────┐
│  📦 Aportar insumos   │  🙋 Voluntariado  │
├──────────────────────┴──────────────────┤
│           🚨 NECESITO AYUDA              │
└──────────────────────────────────────────┘
```

### Submenú — 🚨 NECESITO AYUDA

```
┌──────────────────────────────────────────┐
│  🚑 Emergencias médicas y rescate         │
├──────────────────────────────────────────┤
│  🏠 Refugios y albergues                  │
├──────────────────────────────────────────┤
│  💧 Distribución de víveres               │
├──────────────────────────────────────────┤
│  🐾 Rescate y refugios animales           │
├──────────────────────────────────────────┤
│  ⬅️ Volver                                 │
└──────────────────────────────────────────┘
```

> Nota: la propuesta original decía "3 sub-botones" pero enumeraba 4 ítems. Se incluyen los 4.

### Mapeo de cada acción

| Botón                          | Fuente de datos                                     | ¿Necesita ubicación?        |
| ------------------------------ | --------------------------------------------------- | --------------------------- |
| 📦 Aportar insumos             | `acopios` que **no** son refugio/albergue           | Sí (ordena por cercanía)    |
| 🙋 Voluntariado                | `solicitudes`                                       | Sí                          |
| 🚑 Emergencias médicas/rescate | `emergencyInfo.ts` (números nacionales + enlaces X) | **No** (estático)           |
| 🏠 Refugios y albergues        | `acopios` filtrado por `refugio\|albergue`          | Sí                          |
| 💧 Distribución de víveres     | `acopios` filtrado por víveres                      | Sí                          |
| 🐾 Rescate y refugios animales | —                                                   | No (mensaje "Próximamente") |

### Sub-filtros de `acopios` (palabras clave en `titulo` + `texto`, case-insensitive, sin acentos)

- **Refugios:** `/refugio|albergue|alberg/`
- **Víveres:** `/agua|comida|aliment|viver|despensa|enlatad|formula|leche|potable/`
- **Aportar insumos:** los `acopios` que **no** matchean refugio/albergue (resto).

> El sub-filtro es deliberadamente frágil (depende de cómo redacten las fuentes). Es aceptable para la fase esqueleto; cuando el modelo de datos distinga sub-tipos de `acopios`, se reemplaza por un campo estructurado.

### `callback_data` (≤ 64 bytes, esquema corto)

```
m:home            → pantalla de bienvenida
m:ayuda           → submenú NECESITO AYUDA
m:insumos         → acopios (insumos)
m:voluntariado    → solicitudes
m:emergencias     → números + X
m:refugios        → acopios (refugios)
m:viveres         → acopios (víveres)
m:animales        → mensaje "Próximamente"
m:skiploc:<cat>   → "Ver sin ubicación" para <cat>
```

> **Nota de implementación.** La versión final usa tokens **sin prefijo `m:`** (`home`, `ayuda`, `insumos`, …) — son inequívocos y caben de sobra en 64 bytes. Y "Ver sin ubicación" **no** es un `callback_data`: es un botón del _reply-keyboard_ que envía el texto `SKIP_LOCATION_TEXT` ("Ver sin ubicación"), porque un mismo mensaje no puede combinar reply-keyboard (`request_location`) con inline-keyboard. El handler interpreta ese texto y renderiza la categoría pendiente sin ubicación.

### Render de tarjetas (`cards.ts`)

Cada ítem se renderiza como (máx. ~8 ítems por mensaje para no exceder límites de Telegram):

```
🏠 *<titulo>*  ·  <insignia trust>
<extracto de texto, ~160 chars>
📍 Cómo llegar: https://www.google.com/maps/search/?api=1&query=<lat>,<lng>   (si hay ubicacion)
📏 a ~<distancia> km   (si hay ubicación del usuario y del ítem)
```

Insignias de `trust`: `verificado`→✅, `corroborado`→🟢, `no_verificado`→⚪. Los `sospechoso` ya se excluyen aguas arriba en `retrieval`/snapshot (verificar y, si no, filtrarlos aquí). Ítems sin `ubicacion` se listan al final, sin distancia ni enlace de mapa.

## 5. Flujo de ubicación

Telegram es **sin estado** entre updates: un `message.location` no indica a qué botón correspondía. Se resuelve persistiendo estado mínimo por chat.

```
1. Usuario toca p.ej. 🏠 Refugios  (callback m:refugios)
2. handler lee menuState del chat:
   ├─ ¿ubicación reciente (< 1 h)?  → render lista ordenada por cercanía. FIN.
   └─ no hay/expiró → guarda pendingCategory="refugios"
                      → envía: "📍 Comparte tu ubicación para ordenar por cercanía"
                         con ReplyKeyboard { request_location: true }
                         + botón inline "Ver sin ubicación" (m:skiploc:refugios)
3a. Llega message.location → lee pendingCategory, persiste ubicación (lat,lng,ts),
    limpia pendingCategory, render ordenado, remove_keyboard. FIN.
3b. Usuario toca "Ver sin ubicación" → render sin ordenar por distancia
    (orden por trust + recencia), limpia pendingCategory. FIN.
```

**Frescura:** la ubicación guardada se reusa si `now - ts < 1 h`; pasado ese umbral se vuelve a pedir. (Umbral configurable como constante.)

### Persistencia del estado (`menuState.ts`)

Se extiende el ítem existente del usuario de Telegram (`PK=TGUSER`, `SK=<chatId>`, ver `tgUserRepo.ts`) con campos opcionales en vez de crear otra entidad:

```
pendingCategory?: string      // p.ej. "refugios"; se limpia tras usarse
lastLat?: number
lastLng?: number
lastLocationAt?: string       // ISO
```

Esto evita un segundo ítem y un segundo `write` por interacción. `menuState.ts` expone `getState(chatId)`, `setPending(chatId, category)`, `setLocation(chatId, lat, lng, now)` y `clearPending(chatId)` mediante `UpdateCommand` puntuales. `tgUserRepo.list()` ya ignora claves PK/SK y devolverá estos campos extra inofensivamente; el directorio del admin no se ve afectado.

## 6. Manejo de errores

- `callback_data` desconocido → `answerCallbackQuery` (para quitar el spinner) + volver a `m:home`.
- Categoría vacía → "No hay registros disponibles ahora mismo. Intenta más tarde 🙏".
- Ítems sin `ubicacion` → se muestran al final, sin distancia ni mapa.
- `answerCallbackQuery` siempre se llama (incluso en error) para que el botón no quede "cargando".
- Un fallo en `menuState` (DynamoDB) **no debe romper** la respuesta: si no se puede leer/escribir el estado, se degrada a "sin ubicación" y se loguea `warn` (mismo patrón que el `upsert` aislado actual del handler).
- El menú **no toca Bedrock** → no se aplica el rate-limit pesado a los callbacks (siguen siendo baratos). La pregunta de texto libre conserva su rate-limit actual.
- Verificación del webhook secret: se mantiene igual y debe cubrir también `callback_query` (el secret va en el header, no en el cuerpo, así que aplica a todos los updates).

## 7. Testing (vitest + inyección de dependencias, patrón existente)

- `geo.test.ts` — `haversineKm` contra distancias conocidas; `sortByDistance` con ítems con/sin geo (los sin geo al final).
- `menu.test.ts` — routing de cada `callback_data`; sub-filtros de `acopios` (un ítem "albergue" cae en refugios y no en insumos; un ítem "agua potable" cae en víveres); `m:animales` devuelve "Próximamente"; `callback_data` desconocido → home.
- `cards.test.ts` — render con/sin `ubicacion` (enlace Maps presente/ausente), insignias de `trust`, formato de distancia, truncado de `texto`.
- `emergencyInfo.test.ts` — formato `tel:` válido en los números (sanity check del contenido).
- `handler.test.ts` — nuevas ramas: `callback_query` invoca el router y `sendMessage` con `replyMarkup`; `message.location` persiste ubicación y renderiza; el texto libre sigue yendo a RAG+Bedrock (regresión del flujo actual intacto).

## 8. Fuera de alcance (fases posteriores)

- Campos estructurados por ítem: teléfono, horario, capacidad, inventario de suministros.
- Categoría de animales/veterinarias y sus fuentes.
- Flag de validación manual por admin (hoy solo `trust` automático).
- Números de emergencia por estado (esta fase usa set nacional fijo).
- Detección de "región" a partir de la ubicación.

## 9. Trabajo de contenido pendiente del dueño

`emergencyInfo.ts` se entrega con **placeholders** marcados con `TODO`. El dueño debe rellenar:

- Números oficiales vigentes en Venezuela (911 / Bomberos / Cruz Roja Venezolana / Protección Civil — PCNGRD).
- Cuentas/páginas de X de monitoreo oficial de rescates.

Hasta rellenarse, el botón 🚑 mostrará los placeholders (911 + aviso de que la lista está en actualización).

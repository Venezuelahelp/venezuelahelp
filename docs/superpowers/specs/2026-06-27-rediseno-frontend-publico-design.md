# Diseño — Rediseño del frontend público (editorial sobrio)

- **Fecha:** 2026-06-27
- **Estado:** Aprobado para planificar
- **Alcance:** Solo `frontend-public/`. No toca backend, infra, admin ni el modelo de datos.
- **Relacionado:** `frontend-public/DESIGN.md`, `frontend-public/PRODUCT.md`, `docs/superpowers/plans/2026-06-26-fase4-frontend-publico.md`
- **Prototipo de referencia:** mockup HTML aprobado (editorial sobrio, desktop + móvil). La implementación reusa los componentes y tokens reales del proyecto.

## 1. Contexto y problema

El frontend público actual es **funcional y responsivo**, pero la implementación se desvió de su propio `DESIGN.md` y de su `PRODUCT.md`:

- `DESIGN.md` prescribe **filas densas, NO grilla de cards idénticas** y **color restrained** (el color vive en marca/tipografía, fondo blanco). La app real renderiza justo el anti-patrón: una **grilla de cards idénticas con headers de color sólido** (`ItemList.tsx` → `.cardHeader` con `--row-tint`). El skill `impeccable` lista "identical card grids" entre las prohibiciones absolutas.
- **No existe un hero / primera impresión.** `App.tsx` entra directo al buscador+filtros; falta un encabezado que explique qué es el sitio y guíe al bot en segundos.
- El **wordmark** "Venezuela" en script multicolor (Great Vibes con degradado tricolor de bandera, `Header.module.css` → `.brandVe`) choca con el tono declarado _institucional / sobrio / confiable_ y es justo una anti-referencia del `PRODUCT.md` ("no folclórico/saturado de bandera"). Además usa `background-clip: text` sobre un gradiente, otra prohibición de `impeccable` (gradient text).
- En móvil, la franja marquee **"Fuentes Activas"** (`SourceBanner.tsx`) + "Actualizado" + buscador + "Filtros" + toggle empujan el contenido real (los ítems) muy abajo.

**Objetivo:** una home **más vistosa, más profesional y, sobre todo, más responsiva**, reconciliando la implementación con la dirección que el propio proyecto ya documentó. Dirección elegida en brainstorming: **editorial sobrio**.

### Decisiones acordadas (brainstorming)

1. **Dirección: editorial sobrio.** Lo vistoso viene de jerarquía tipográfica, espacio y un hero con carácter, no de bloques de color.
2. **Marca: wordmark institucional nuevo.** `VenezuelaHelp` en Inter (peso fuerte) con "Help" en azul institucional + una marca cuadrada con glifo de sismógrafo. Se elimina Great Vibes y el tricolor.
3. **Color mínimo: punto + badge.** Fondo blanco; cada ítem identifica su categoría con un punto-anillo de color y un badge pequeño del mismo hue. Cero headers de color sólido.
4. **Hero nuevo:** titular editorial + subtítulo (qué es + cómo usar el bot) + dos CTAs (Telegram primario, "Ver la información" secundario) + línea de meta (registros · fuentes · fecha) con indicador "Actualizado" que late suave.
5. **Lista densa editorial:** filas con hairlines, ancho de lectura acotado y centrado en desktop; hover sutil + chevron; entrada con stagger y `prefers-reduced-motion` cubierto.
6. **Responsividad estructural** como prioridad transversal (ver §5).

### No-objetivos (YAGNI)

- No se rediseña la **vista Mapa** (Leaflet ya funciona); solo se reestiliza el toggle Lista/Mapa.
- No se toca la **lógica de datos** (`useSnapshot`, `filter`, `categories`, tipos) ni el **modal de detalle** salvo su estilo.
- No se cambia el **routing** ni la página "¿Quiénes somos?" (`AboutPage`), más allá de que comparta tokens nuevos.
- No se añade dependencia de animación; el motion se hace con CSS.

## 2. Principios de diseño (de impeccable + DESIGN.md, reafirmados)

- **Legibilidad y contraste AA primero.** Cuerpo ≥4.5:1; placeholders con `--muted`, no gris claro.
- **Jerarquía por escala + peso**, no por color de fondo.
- **Cards son la respuesta perezosa:** la lista usa **filas**, no cards.
- **Sin AI-slop:** sin gradient text, sin glassmorphism decorativo, sin hero-metric template, sin side-stripe borders, sin grilla de cards idénticas, sin eyebrows uppercase por sección, sin border-1px + shadow≥16px juntos, radios de card 12–16px (nunca 24px+).
- **Motion intencional:** 150–250 ms, ease-out exponencial, sin bounce; reveal sobre contenido ya visible (no gated por clase); `prefers-reduced-motion` siempre.
- **Copy:** sin em dashes, sin buzzwords; labels verbo+objeto; links con sentido propio.

## 3. Arquitectura de la página

Composición de `App.tsx` (ruta home; la ruta `#/quienes-somos` sigue mostrando `AboutPage`):

```
<Header/>            sticky · wordmark institucional + ¿Quiénes somos? + CTA Telegram (visible también en móvil)
<Hero/>              titular + subtítulo + 2 CTAs + meta (registros · fuentes · fecha) + pulso "Actualizado"
<StickyControls/>    sticky bajo el header · buscador + chips (con punto de color) + [móvil: colapsable]
  <resbar>           N resultados  ·  ViewToggle (Lista/Mapa)
  <results>          ancho de lectura acotado (~780px, centrado en desktop):
    Lista → <ItemList/> (filas) + <Pagination/>
    Mapa  → <MapView/> (lazy, sin cambios funcionales)
<Footer/>            "Fuentes monitoreadas" (chips de fuente + conteo) + disclaimer + fecha
```

Cambios estructurales respecto a hoy:

- **Se añade `Hero`** (componente nuevo).
- **Se elimina `SourceBanner`** (marquee "Fuentes Activas") del flujo: su información (fuentes activas + "Actualizado") se reparte entre la **meta del Hero** y el **Footer** (que ya lista fuentes). Esto recupera espacio vertical crítico en móvil. El componente y sus tests se borran.
- `Header`, `FilterBar`, `ItemList`, `Footer` se **reestilizan** (y `ItemList` se **reestructura** de cards a filas), conservando sus props/contratos con `App.tsx`.

**Principio de aislamiento:** cada componente mantiene su interfaz pública actual (mismas props), de modo que `App.tsx` cambia poco (compone `Hero`, deja de componer `SourceBanner`). El trabajo es mayormente CSS + markup interno de cada componente.

## 4. Sistema visual (tokens)

Se extiende `src/styles/tokens.css` reusando lo existente. Adiciones:

- **Tintes por categoría** (mismo hue, L alto) para los badges, o bien seguir usando el `color-mix(in oklab, var(--cat-x) 14%, white)` que `Badge.tsx` ya aplica (preferido: no añade tokens). Decisión: **reusar `Badge.tsx` tal cual** para el badge; el **punto-anillo** usa `var(--cat-x)` directo.
- `--surface-2: oklch(0.965 0.005 255)` para el footer.
- `--shadow-sm` (≤2px) y `--shadow-md` (≤24px blur, baja opacidad) — **nunca** combinados con border en el mismo elemento.
- `--readw: 780px` (ancho de lectura de la lista) y `--maxw: 1100px` (contenedor, ya implícito).
- Radios: `--r-card: 12px`, `--r-input: 10px`.
- Se mantienen `--bg` blanco, neutros, `--primary` azul y los `--cat-*`.

Tipografía: **solo Inter** (400/600/700/800 ya importados en `main.tsx`; se añade 500 si hace falta para meta/labels). Se elimina el import de `@fontsource/great-vibes/400.css` y la dependencia (solo la usaba el wordmark).

## 5. Responsividad (prioridad transversal)

Mobile-first, breakpoints estructurales (no tipografía fluida que rompa):

- **Header:** móvil mantiene wordmark + CTA visible (texto acortado a "Telegram" bajo cierto ancho) y el dropdown existente para "¿Quiénes somos?". El CTA a Telegram **nunca** se esconde tras el hamburguesa.
- **Hero:** apila; el titular usa `clamp()` con techo ≤ 3.3rem y `text-wrap: balance`; se prueba el copy a 320px para que no desborde.
- **Controles:** buscador full-width; chips en **carrusel horizontal** con scroll táctil (sin scrollbar visible); en ≥640px buscador + chips en una fila. El colapso "Filtros" actual se conserva como opción móvil.
- **resbar:** apila (conteo arriba, toggle abajo) en pantallas chicas.
- **Lista:** las filas pasan de grid de 3 columnas (punto · cuerpo · chevron) a 2 columnas (punto · cuerpo) ocultando el chevron en móvil; meta envuelve.
- **Sin scroll horizontal de página** en ningún breakpoint; targets táctiles ≥40px.

Verificación obligatoria por captura en 320 / 375 / 768 / 1440 px (ver plan).

## 6. Componentes (detalle de cambios)

| Componente     | Acción            | Cambio                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Header`       | Reestilizar       | Wordmark institucional (Inter 800, "Help" en `--primary`) + marca SVG sismógrafo. Quitar `.brandVe`/Great Vibes/gradient-text. Conservar nav + dropdown móvil. CTA con texto acortable.                                                                                                                                                         |
| `Hero`         | **Crear**         | Eyebrow "Actualizado" con pulso, `h1` editorial, `p` de subtítulo, 2 CTAs, línea meta (registros/fuentes/fecha). Recibe `generatedAt`, `total`, `sourceCount` por props.                                                                                                                                                                        |
| `FilterBar`    | Reestilizar       | Chips con punto de color de categoría + conteo; estado activo `--primary-tint`/borde `--primary`. Buscador y carrusel responsivos. Conserva props y el colapso móvil.                                                                                                                                                                           |
| `ItemList`     | **Reestructurar** | De cards con header de color → **filas**: punto-anillo (color categoría) + `Badge` + título + texto (clamp 2 líneas) + meta (ubicación · fecha · `[severidad]` · fuente) + chevron. Conserva el `Modal` de detalle (solo estilo) y el `onClick` que lo abre. Lista centrada a `--readw`. Stagger en entrada con tope (`MAX_STAGGER` ya existe). |
| `SourceBanner` | **Eliminar**      | Borrar componente, CSS y tests; quitar uso en `App.tsx`.                                                                                                                                                                                                                                                                                        |
| `Footer`       | Reestilizar       | "Fuentes monitoreadas" (chips de fuente + conteo) + disclaimer + "Datos actualizados". Fondo `--surface-2`.                                                                                                                                                                                                                                     |
| `Badge`        | Reusar            | Sin cambios (ya hace color-sobre-tinte).                                                                                                                                                                                                                                                                                                        |
| `App`          | Modificar         | Componer `Hero`; dejar de componer `SourceBanner`; pasar `generatedAt`/conteos al Hero/Footer. Resto de la orquestación (filtros, paginación, vista) intacto.                                                                                                                                                                                   |
| `tokens.css`   | Extender          | Añadir tokens de §4.                                                                                                                                                                                                                                                                                                                            |
| `main.tsx`     | Modificar         | Quitar import de Great Vibes (y opcional `400.css`→añadir 500 si se usa).                                                                                                                                                                                                                                                                       |

## 7. Accesibilidad

- Contraste AA verificado en cuerpo, meta, placeholders, badges (texto del color de la categoría sobre tinte del mismo hue ≥4.5:1; donde no llegue, oscurecer el texto).
- Foco visible en todo interactivo (ya hay patrón `--focus-ring`).
- Navegable por teclado: chips (`aria-pressed`), toggle de vista, filas (botón que abre el modal), enlaces de fuente con texto propio.
- `prefers-reduced-motion: reduce` desactiva pulso, stagger y transiciones de hover.
- El pulso "Actualizado" es decorativo (`aria-hidden`); la fecha va como texto.

## 8. Testing

Reusar el set actual de `vitest` + Testing Library:

- Ajustar tests que asuman la estructura de cards de `ItemList` (headers de color) a la nueva estructura de filas (rol de lista, título, que el click abra el modal).
- Eliminar los tests de `SourceBanner`.
- Añadir test de `Hero`: renderiza titular, CTA a `t.me/VenezuelaHelpInfoBot`, y la meta con conteo/fecha.
- Mantener verdes `filters.test`, `pagination.test`, `mapview.test`, `useSnapshot.test`, `filter.test`, `app.test`/`smoke.test` (ajustando selectores rotos por el re-layout).
- **Verificación visual** (impeccable): capturas en 4 breakpoints antes de cerrar.

## 9. Riesgos y mitigaciones

- **Tests acoplados al DOM viejo:** el cambio de cards→filas y la baja de `SourceBanner` romperán selectores. Mitigación: actualizar tests como parte de cada tarea (TDD: rojo→verde).
- **Regresión de contraste** al pasar de texto blanco sobre color a texto de color sobre blanco. Mitigación: verificar AA explícitamente en badges/severidad.
- **Hero que desborda** en 320px. Mitigación: `clamp()` con techo bajo + prueba de copy en el breakpoint mínimo.
- **Deploy:** el frontend público se publica con `VenezuelaHelpFrontendStack` desde `frontend-public/dist` → buildear antes. (Fuera de alcance de este spec; se documenta en el plan como nota de cierre.)

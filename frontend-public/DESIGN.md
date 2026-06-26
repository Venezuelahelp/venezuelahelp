# DESIGN.md — VenezuelaHelp Frontend Público

Sistema visual del sitio público informativo del terremoto. Tono: **institucional y confiable** (sobrio, alto contraste, calma). Aplica las reglas de la skill `impeccable` (OKLCH, contraste AA, sin AI-slop). Mobile-first.

## Register

Sitio informativo público (brand-leaning: la primera impresión importa, pero el contenido es utilitario — datos de emergencia). Prioridad: legibilidad, confianza, velocidad en móvil y conexiones lentas.

## Color (OKLCH)

Estrategia: **restrained** — neutros + un acento azul institucional. El color vive en la marca y la tipografía, NO en el fondo (fondo blanco puro).

```css
:root {
  /* superficies */
  --bg: oklch(1 0 0); /* blanco puro */
  --surface: oklch(0.975 0.004 255); /* tinte frío sutil para zonas/inputs */
  --border: oklch(0.9 0.006 255);
  --border-strong: oklch(0.82 0.008 255);

  /* texto (contraste verificado sobre --bg) */
  --ink: oklch(0.24 0.02 255); /* cuerpo ~13:1 */
  --ink-strong: oklch(0.17 0.02 255); /* títulos */
  --muted: oklch(0.45 0.02 255); /* secundario ≥4.5:1 sobre blanco */

  /* marca */
  --primary: oklch(0.48 0.13 250); /* azul institucional */
  --primary-strong: oklch(0.4 0.14 250); /* hover/active */
  --primary-tint: oklch(0.96 0.02 250); /* fondo de chips activos */
  --on-primary: oklch(1 0 0);

  /* roles por categoría (full palette para data viz: marcadores + badges, desaturados) */
  --cat-reportes: oklch(0.5 0.07 250); /* azul-gris */
  --cat-desaparecidos: oklch(0.58 0.11 65); /* ámbar (atención, no alarma) */
  --cat-acopios: oklch(0.52 0.09 150); /* verde */
  --cat-edificios: oklch(0.5 0.11 30); /* terracota/rojo-tierra */
  --cat-solicitudes: oklch(0.5 0.1 290); /* violeta */

  /* estados */
  --focus-ring: oklch(0.48 0.13 250);
}
```

Contraste: cuerpo `--ink` y `--muted` cumplen ≥4.5:1 sobre blanco; placeholders usan `--muted` (no gris claro). Badges de categoría: texto del color de la categoría sobre un tinte del MISMO hue (no gris sobre color).

## Tipografía

Una sola familia bien afinada con contraste de peso (evita indecisión): **Inter** (variable) con fallback de sistema. Mono opcional para IDs/conteos: `ui-monospace`.

```css
--font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

Escala (clamp, ratio ~1.25). Hero techo ≤ 6rem; tracking display ≥ -0.03em:

- `--t-hero`: clamp(2.2rem, 6vw, 3.6rem); weight 800; letter-spacing -0.02em; `text-wrap: balance`.
- `--t-h2`: clamp(1.5rem, 3.5vw, 2rem); weight 700.
- `--t-h3`: 1.25rem; weight 650.
- `--t-body`: 1rem/1.6; weight 400; `--ink`. Línea ≤ 70ch.
- `--t-small`: 0.875rem; `--muted`.
- `--t-label`: 0.75rem; weight 600; uppercase SOLO en labels/badges ≤4 palabras (no en frases).

## Layout & spacing

- Base 4px: 4/8/12/16/24/32/48/64.
- Contenedor: max-width 1100px, padding lateral 16–24px.
- Grids responsivos sin breakpoints: `repeat(auto-fit, minmax(280px, 1fr))` donde aplique.
- z-index semántico: dropdown(10) → sticky(20) → modal-backdrop(30) → modal(40) → toast(50).
- Radios moderados: cards/inputs 10–12px; chips/badges full-pill. **Nunca** 24px+ en cards.

## Componentes

- **Header** (sticky): wordmark "VenezuelaHelp" + botón primario "Preguntar por Telegram" (link a @VenezuelaHelpInfoBot). En móvil el CTA se mantiene visible.
- **Hero**: título + 1–2 frases explicando qué es y cómo usar el bot; CTA grande a Telegram; nota de actualización ("Datos actualizados: <generatedAt>"). Sin "hero-metric template".
- **Resumen**: barra compacta inline con conteos por categoría (NO tarjetas de números gigantes). Sirve también de filtro rápido.
- **Filtro**: input de búsqueda (placeholder con contraste) + chips de categoría (toggle). Chip activo = `--primary-tint` con borde `--primary`.
- **Mapa**: Leaflet + OpenStreetMap, marcadores coloreados por categoría, popup con título/ubicación/fuente. Colapsable/секcondario en móvil (lista primero).
- **Lista**: **filas** (no grilla de cards idénticas). Cada fila: indicador de categoría (punto/badge del color), título, texto breve, ubicación, fuente, link. Densa y legible.
- **Estados**: loading (skeleton sobrio), vacío ("No hay resultados para …"), error ("No pudimos cargar los datos. Reintentar"). Todos en español, claros.

## Motion

- Entrada de la lista: fade/translate sutil con stagger ligero al cargar datos (ease-out-quart). Contenido visible por defecto (no gated por clase).
- Hover de filas/chips: transición de color 120–160ms.
- `@media (prefers-reduced-motion: reduce)`: crossfade/instantáneo.

## Bans aplicados (de impeccable)

Sin: side-stripe borders, gradient text, glassmorphism decorativo, hero-metric template, grillas de cards idénticas, eyebrows uppercase por sección, numeritos 01/02/03, border-1px + shadow≥16px juntos, radios 24px+ en cards, SVG sketchy, stripes repeating-gradient. Copy: sin em dashes, sin buzzwords, labels verbo+objeto, links con sentido propio.

## Datos

Fuente única: `snapshot.json` (servido por CloudFront desde el bucket privado vía OAC). Forma: `{ generatedAt, categories: { reportes:[], desaparecidos:[], acopios:[], edificios:[], solicitudes:[] } }`. Cada item: `{ category, sourceId, externalId, titulo, texto, ubicacion?:{lat,lng,nombre}, status? }`. El front escapa todo el texto de terceros (mitiga XSS — React lo hace por defecto al renderizar como texto).

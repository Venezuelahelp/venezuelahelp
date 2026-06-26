# Rediseño del frontend público (editorial sobrio) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la home pública a una dirección **editorial sobria** (hero nuevo, wordmark institucional, filas densas en vez de cards de color, color mínimo punto+badge), más vistosa, profesional y responsiva, sin tocar backend ni la lógica de datos.

**Architecture:** Trabajo confinado a `frontend-public/`. Se añade un componente `Hero`, se elimina `SourceBanner`, y se reestilizan/reestructuran `Header`, `ItemList` (cards→filas), `FilterBar` y `Footer` conservando sus props (contratos con `App.tsx` intactos). El color vive en puntos+badges (se reutiliza `Badge.tsx` tal cual). Motion en CSS con `prefers-reduced-motion`.

**Tech Stack:** React 18 + TypeScript strict, Vite, CSS Modules, tokens OKLCH en `src/styles/tokens.css`, Phosphor Icons, vitest + Testing Library, alias `@/` → `frontend-public/src`. Fuente: Inter (`@fontsource/inter`).

## Global Constraints

- **TypeScript strict** siempre. Imports con alias `@/` → `frontend-public/src`.
- **Solo `frontend-public/`**: no tocar backend, infra, admin, ni el modelo de datos (`useSnapshot`, `filter`, `categories`, `types`).
- **Bans de `impeccable`/`DESIGN.md`** (refuse-and-rewrite): sin gradient text, sin glassmorphism decorativo, sin hero-metric template, sin side-stripe borders (`border-left/right` >1px de color), sin grilla de cards idénticas, sin eyebrows uppercase por sección, sin `border 1px + box-shadow ≥16px` en el mismo elemento, radios de card 12–16px (nunca 24px+).
- **Contraste AA**: cuerpo y placeholders ≥4.5:1; texto de color sobre tinte del mismo hue ≥4.5:1.
- **Motion**: 150–250 ms, ease-out exponencial, sin bounce; reveal sobre contenido ya visible (no gated por clase); `@media (prefers-reduced-motion: reduce)` en cada animación.
- **Copy**: sin em dashes (`—`) ni `--`; sin buzzwords; labels verbo+objeto; links con texto propio.
- **Idioma**: UI en español de Venezuela (es-VE).
- Tests: `npm test --workspace @venezuelahelp/frontend-public` (script `vitest run`). Un archivo: `npm test --workspace @venezuelahelp/frontend-public -- <ruta-relativa-al-workspace>`.
- Cada commit usa Conventional Commits con emoji y termina con el trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Rama de trabajo: `feat/rediseno-frontend-publico` (ya creada desde `main`). No commitear a `main`, no `git push --force`.
- El dev server para verificación visual: `npm run dev --workspace @venezuelahelp/frontend-public` (Vite en `http://localhost:5173/`).

---

## Estructura de archivos

| Archivo                                  | Acción       | Responsabilidad                                                                       |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`                  | Modificar    | Añadir tokens (`--surface-2`, `--shadow-sm/-md`, `--readw`, `--r-card`, `--r-input`). |
| `src/main.tsx`                           | Modificar    | Quitar import de Great Vibes; añadir Inter 500.                                       |
| `src/components/Header.tsx`              | Modificar    | Wordmark institucional + marca SVG sismógrafo; CTA con texto acortable.               |
| `src/components/Header.module.css`       | Modificar    | Estilos del nuevo wordmark; quitar `.brandVe`/gradient-text.                          |
| `src/components/Hero.tsx`                | **Crear**    | Hero: eyebrow con pulso, titular, subtítulo, 2 CTAs, meta.                            |
| `src/components/Hero.module.css`         | **Crear**    | Estilos del Hero.                                                                     |
| `src/components/__tests__/hero.test.tsx` | **Crear**    | Tests del Hero.                                                                       |
| `src/App.tsx`                            | Modificar    | Componer `Hero`; dejar de componer `SourceBanner`; pasar props.                       |
| `src/components/SourceBanner.tsx`        | **Eliminar** | Se reparte su info entre Hero y Footer.                                               |
| `src/components/SourceBanner.module.css` | **Eliminar** | —                                                                                     |
| `src/components/ItemList.tsx`            | Modificar    | Cards con header de color → **filas** (punto+badge+título+texto+meta+chevron).        |
| `src/components/ItemList.module.css`     | Modificar    | Estilos de fila; conservar estilos del modal de detalle.                              |
| `src/components/__tests__/list.test.tsx` | Modificar    | Ajustar a la estructura de filas (sin romper aserciones de contenido).                |
| `src/components/FilterBar.tsx`           | Modificar    | Chips con punto de color de categoría.                                                |
| `src/components/FilterBar.module.css`    | Modificar    | Estilo de chip con punto; carrusel responsivo.                                        |
| `src/components/Footer.module.css`       | Modificar    | Fondo `--surface-2`, chips de fuente refinados.                                       |

Orden de tareas (cada una con deliverable testeable independiente):

1. Tokens + fuentes · 2. Header · 3. Hero (crear) · 4. App + baja de SourceBanner · 5. ItemList (cards→filas) · 6. FilterBar · 7. Footer · 8. Verificación responsiva + visual + build.

---

### Task 1: Tokens y fuentes (fundación)

**Files:**

- Modify: `src/styles/tokens.css`
- Modify: `src/main.tsx`

**Interfaces:**

- Produces (CSS custom properties, disponibles globalmente): `--surface-2`, `--shadow-sm`, `--shadow-md`, `--readw`, `--r-card`, `--r-input`.

- [ ] **Step 1: Añadir tokens nuevos a `tokens.css`**

En `src/styles/tokens.css`, dentro del bloque `:root { ... }`, justo después de la línea `--focus-ring: ...;` añadir:

```css
/* superficie secundaria (footer) */
--surface-2: oklch(0.965 0.005 255);

/* sombras (nunca combinar con border en el mismo elemento) */
--shadow-sm: 0 1px 2px oklch(0.2 0.02 255 / 0.05);
--shadow-md: 0 6px 24px oklch(0.2 0.04 255 / 0.08);

/* medidas */
--readw: 780px; /* ancho de lectura de la lista */
--r-card: 12px;
--r-input: 10px;
```

- [ ] **Step 2: Quitar Great Vibes y añadir Inter 500 en `main.tsx`**

En `src/main.tsx`, reemplazar el bloque de imports de fuentes:

```tsx
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/great-vibes/400.css";
import "./styles/tokens.css";
```

por:

```tsx
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./styles/tokens.css";
```

- [ ] **Step 3: Quitar la dependencia Great Vibes de `package.json`**

En `frontend-public/package.json`, eliminar la línea de dependencias:

```json
    "@fontsource/great-vibes": "^5.2.8",
```

- [ ] **Step 4: Verificar que la suite sigue verde**

Run: `npm test --workspace @venezuelahelp/frontend-public`
Expected: PASS (no se cambió comportamiento; las fuentes son CSS side-effect imports).

- [ ] **Step 5: Verificar que el build compila**

Run: `npm run build --workspace @venezuelahelp/frontend-public`
Expected: build exitoso (sin error de módulo `great-vibes` faltante en imports residuales).

- [ ] **Step 6: Commit**

```bash
git add frontend-public/src/styles/tokens.css frontend-public/src/main.tsx frontend-public/package.json
git commit -m "$(printf '🎨 feat(frontend-public): tokens de rediseño y baja de Great Vibes\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: Header — wordmark institucional + marca sismógrafo

**Files:**

- Modify: `src/components/Header.tsx`
- Modify: `src/components/Header.module.css`
- Test (ya existe, debe seguir verde): `src/components/__tests__/presentational.test.tsx`

**Interfaces:**

- Consumes: tokens de Task 1.
- Produces: `Header` sin cambios de props (no recibe props). Mantiene `aria-label="VenezuelaHelp"` en el link de marca y el link a `https://t.me/VenezuelaHelpInfoBot` con `target="_blank"` y `rel="noopener noreferrer"` (requerido por `presentational.test.tsx`).

- [ ] **Step 1: Ejecutar los tests del Header para fijar la línea base verde**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/presentational.test.tsx`
Expected: PASS (línea base antes de tocar nada).

- [ ] **Step 2: Reemplazar el markup del wordmark en `Header.tsx`**

En `src/components/Header.tsx`, reemplazar el `<a ... className={styles.wordmark}>...</a>` (el bloque con `brandVe`/`brandHelp`) por:

```tsx
<a href="#/" className={styles.wordmark} aria-label="VenezuelaHelp">
  <span className={styles.mark} aria-hidden="true">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12 h3 l2 -7 l4 14 l3 -10 l2 5 h6" />
    </svg>
  </span>
  <span className={styles.name}>
    Venezuela<b>Help</b>
  </span>
</a>
```

(El `aria-label="VenezuelaHelp"` mantiene el nombre accesible que esperan los tests aunque el texto visible esté partido en `Venezuela` + `<b>Help</b>`.)

- [ ] **Step 3: Reescribir los estilos del wordmark en `Header.module.css`**

En `src/components/Header.module.css`, **eliminar** las reglas `.brandVe`, `.brandHelp` y `.wordmark:hover .brandHelp`, y reemplazar la regla `.wordmark` por:

```css
.wordmark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  flex-shrink: 0;
}

.mark {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--on-primary);
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  box-shadow: var(--shadow-sm);
}

.name {
  font-size: 1.18rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ink-strong);
}

.name b {
  color: var(--primary);
  font-weight: 800;
}
```

Además, en el bloque `@media (max-width: 480px)`, reemplazar las reglas `.brandVe`/`.brandHelp` por:

```css
.name {
  font-size: 1.05rem;
}
.mark {
  width: 30px;
  height: 30px;
}
```

- [ ] **Step 4: Acortar el CTA en pantallas estrechas**

En `src/components/Header.tsx`, dentro del CTA de escritorio (el `<a ... className={styles.cta}>`), reemplazar el texto `Preguntar por Telegram` por:

```tsx
            <span className={styles.ctaFull}>Preguntar por Telegram</span>
            <span className={styles.ctaShort}>Telegram</span>
```

Y en `Header.module.css` añadir al final:

```css
.ctaShort {
  display: none;
}

@media (max-width: 380px) {
  .ctaFull {
    display: none;
  }
  .ctaShort {
    display: inline;
  }
}
```

- [ ] **Step 5: Verificar que los tests del Header siguen verdes**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/presentational.test.tsx`
Expected: PASS (el nombre accesible `VenezuelaHelp` y el link de Telegram intactos).

- [ ] **Step 6: Commit**

```bash
git add frontend-public/src/components/Header.tsx frontend-public/src/components/Header.module.css
git commit -m "$(printf '🎨 feat(frontend-public): wordmark institucional con marca de sismógrafo\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: Hero (componente nuevo)

**Files:**

- Create: `src/components/Hero.tsx`
- Create: `src/components/Hero.module.css`
- Test: `src/components/__tests__/hero.test.tsx`

**Interfaces:**

- Consumes: tokens de Task 1; `formatDateTime` de `@/data/datetime`.
- Produces:
  - `interface HeroProps { total: number; sourceCount: number; generatedAt?: string }`
  - `export default function Hero(props: HeroProps): JSX.Element`
  - Renderiza un link a `https://t.me/VenezuelaHelpInfoBot` (nombre accesible contiene "Telegram", `target="_blank"`, `rel="noopener noreferrer"`), un `<h1>`, y una línea meta que incluye el conteo `total`, `sourceCount` y la fecha vía `formatDateTime`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/__tests__/hero.test.tsx
import { render, screen } from "@testing-library/react";
import Hero from "@/components/Hero";

describe("Hero", () => {
  it("renders the editorial headline", () => {
    render(
      <Hero total={6} sourceCount={3} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /terremoto/i }),
    ).toBeInTheDocument();
  });

  it("links to the Telegram bot safely", () => {
    render(
      <Hero total={6} sourceCount={3} generatedAt="2026-06-26T18:00:00Z" />,
    );
    const link = screen.getByRole("link", { name: /telegram/i });
    expect(link).toHaveAttribute("href", "https://t.me/VenezuelaHelpInfoBot");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the record count, source count and date in the meta line", () => {
    render(
      <Hero total={6} sourceCount={3} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("omits the date gracefully when generatedAt is missing", () => {
    expect(() => render(<Hero total={0} sourceCount={0} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/hero.test.tsx`
Expected: FAIL con "Cannot find module '@/components/Hero'".

- [ ] **Step 3: Crear `Hero.tsx`**

```tsx
// src/components/Hero.tsx
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { formatDateTime } from "@/data/datetime";
import styles from "./Hero.module.css";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

interface HeroProps {
  total: number;
  sourceCount: number;
  generatedAt?: string;
}

export default function Hero({ total, sourceCount, generatedAt }: HeroProps) {
  const updated = formatDateTime(generatedAt);

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <span className={styles.eyebrow}>
          <span className={styles.pulse} aria-hidden="true" />
          Actualizado con fuentes públicas
        </span>

        <h1 className={styles.title}>
          La información del terremoto, reunida en un solo lugar.
        </h1>

        <p className={styles.lede}>
          Reportes, personas desaparecidas, centros de acopio, edificios dañados
          y solicitudes de ayuda, recopilados de fuentes públicas. Pregunta lo
          que necesites al bot de Telegram en lenguaje natural.
        </p>

        <div className={styles.actions}>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaPrimary}
          >
            <PaperPlaneTilt aria-hidden="true" size={16} weight="fill" />
            Abrir el bot de Telegram
          </a>
          <a href="#resultados" className={styles.ctaGhost}>
            Ver la información
          </a>
        </div>

        <div className={styles.meta}>
          <span>
            <b>{total}</b> registros
          </span>
          <span className={styles.dot} aria-hidden="true" />
          <span>
            <b>{sourceCount}</b> fuentes monitoreadas
          </span>
          {updated && (
            <>
              <span className={styles.dot} aria-hidden="true" />
              <span>{updated}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Crear `Hero.module.css`**

```css
/* Hero — editorial, sobrio. Sin hero-metric template, sin gradient text. */
.hero {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

/* Acento de marca muy sutil (no glassmorphism, no stripes). */
.hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 120px;
  pointer-events: none;
  background: radial-gradient(
    120% 100% at 80% 120%,
    oklch(0.48 0.13 250 / 0.05),
    transparent 60%
  );
}

.inner {
  position: relative;
  z-index: 1;
  max-width: 1100px;
  margin-inline: auto;
  padding: 40px 16px 28px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 14px;
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cat-acopios);
  animation: pulse 2.4s ease-out infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 oklch(0.5 0.1 150 / 0.45);
  }
  70% {
    box-shadow: 0 0 0 7px oklch(0.5 0.1 150 / 0);
  }
  100% {
    box-shadow: 0 0 0 0 oklch(0.5 0.1 150 / 0);
  }
}

.title {
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--ink-strong);
  font-size: clamp(2rem, 5.2vw, 3.3rem);
  line-height: 1.06;
  text-wrap: balance;
  max-width: 18ch;
}

.lede {
  margin: 16px 0 0;
  color: var(--ink);
  font-size: clamp(1rem, 1.6vw, 1.15rem);
  max-width: 54ch;
  line-height: 1.6;
  text-wrap: pretty;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.ctaPrimary,
.ctaGhost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 0.94rem;
  border-radius: var(--r-input);
  padding: 11px 18px;
  border: 1px solid transparent;
  text-decoration: none;
  transition:
    transform 120ms ease,
    background 150ms ease;
}

.ctaPrimary {
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--shadow-sm);
}

.ctaPrimary:hover {
  background: var(--primary-strong);
  transform: translateY(-1px);
}

.ctaGhost {
  background: var(--bg);
  color: var(--ink-strong);
  border-color: var(--border-strong);
}

.ctaGhost:hover {
  background: var(--surface);
}

.ctaPrimary:focus-visible,
.ctaGhost:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-top: 22px;
  color: var(--muted);
  font-size: 0.875rem;
}

.meta b {
  color: var(--ink-strong);
  font-weight: 700;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--border-strong);
}

@media (min-width: 640px) {
  .inner {
    padding: 56px 24px 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
  .ctaPrimary,
  .ctaGhost {
    transition: none;
  }
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/hero.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend-public/src/components/Hero.tsx frontend-public/src/components/Hero.module.css frontend-public/src/components/__tests__/hero.test.tsx
git commit -m "$(printf '✨ feat(frontend-public): componente Hero editorial con CTA al bot\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: App — componer Hero y eliminar SourceBanner

**Files:**

- Modify: `src/App.tsx`
- Delete: `src/components/SourceBanner.tsx`
- Delete: `src/components/SourceBanner.module.css`
- Test (debe seguir verde): `src/__tests__/app.test.tsx`, `src/__tests__/smoke.test.tsx`

**Interfaces:**

- Consumes: `Hero` (Task 3) con `HeroProps { total, sourceCount, generatedAt }`; helpers existentes `flatten`, `countBySource`.
- Produces: la home renderiza `Header → Hero → controles → resultados → Footer`. El elemento de controles tiene `id="resultados"` (ancla del CTA "Ver la información" del Hero).

- [ ] **Step 1: Ejecutar la suite de App para fijar la base verde**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/__tests__/app.test.tsx src/__tests__/smoke.test.tsx`
Expected: PASS (base actual; `app.test` ya satisface `/Datos actualizados/i` vía Footer y pasará a satisfacerlo vía Footer todavía; no se rompe).

- [ ] **Step 2: Quitar el import y el uso de `SourceBanner` en `App.tsx`**

En `src/App.tsx`, eliminar la línea:

```tsx
import SourceBanner from "@/components/SourceBanner";
```

y añadir el import del Hero junto a los demás:

```tsx
import Hero from "@/components/Hero";
```

- [ ] **Step 3: Componer el Hero y reemplazar el SourceBanner**

En `src/App.tsx`, dentro del render de datos cargados, **eliminar** el bloque:

```tsx
<SourceBanner sources={countBySource(items)} generatedAt={data.generatedAt} />
```

e insertar, **antes** de `<SourcesContext.Provider ...>` que envuelve el contenido, el Hero (que necesita los conteos). Reestructurar el `return` del IIFE así (manteniendo el resto igual):

```tsx
            return (
              <SourcesContext.Provider value={data.sources}>
                <Hero
                  total={items.length}
                  sourceCount={countBySource(items).length}
                  generatedAt={data.generatedAt}
                />

                <div className={styles.container}>
                  <div className={styles.controls} id="resultados" ref={controlsRef}>
                    {/* ...FilterBar y subControls sin cambios... */}
```

(Es decir: se borra el `<SourceBanner/>`, se añade `<Hero/>` arriba, y al `div.controls` se le agrega `id="resultados"`.)

- [ ] **Step 4: Borrar los archivos de SourceBanner**

```bash
git rm frontend-public/src/components/SourceBanner.tsx frontend-public/src/components/SourceBanner.module.css
```

- [ ] **Step 5: Verificar que App y smoke siguen verdes**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/__tests__/app.test.tsx src/__tests__/smoke.test.tsx`
Expected: PASS. (El test "shows generatedAt date in Hero when data loads" busca `/Datos actualizados/i`, que sigue presente en el Footer; el resto no depende de SourceBanner.)

- [ ] **Step 6: Verificar la suite completa**

Run: `npm test --workspace @venezuelahelp/frontend-public`
Expected: PASS (sin referencias colgantes a SourceBanner).

- [ ] **Step 7: Commit**

```bash
git add frontend-public/src/App.tsx
git commit -m "$(printf '♻️ refactor(frontend-public): componer Hero y retirar el banner marquee de fuentes\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: ItemList — de cards de color a filas densas

**Files:**

- Modify: `src/components/ItemList.tsx`
- Modify: `src/components/ItemList.module.css`
- Test: `src/components/__tests__/list.test.tsx`

**Interfaces:**

- Consumes: `Item` de `@/types`; `CATEGORY_META`; `Badge`, `Source`, `Modal`; `formatDateShort`, `formatDateTime`.
- Produces: `ItemList({ items }: { items: Item[] })` con la MISMA API. El DOM mantiene: un `role="list"` con un `listitem` por ítem; cada fila tiene un `<button>` cuyo nombre accesible incluye el `titulo` y abre el `Modal` (`role="dialog"`); el `Source` y la fecha siguen presentes en el texto. (Requerido por `list.test.tsx`.)

- [ ] **Step 1: Actualizar los tests de la lista a la estructura de filas**

En `src/components/__tests__/list.test.tsx`, el set de aserciones sigue válido salvo que el contenedor de lista pasa a `<ul>` con filas. No hace falta cambiar las aserciones de contenido (título, fuente, ubicación, fecha, botón→dialog) porque la nueva estructura las conserva. **Añadir** un test que fija el contrato de fila (punto de categoría + badge visible):

```tsx
it("renders a category badge label per row", () => {
  render(<ItemList items={items} />);
  // El Badge muestra la etiqueta de la categoría (p. ej. "Reportes")
  expect(screen.getAllByText("Reportes").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Desaparecidos").length).toBeGreaterThan(0);
});
```

(Insertarlo dentro del `describe("ItemList", ...)`.)

- [ ] **Step 2: Ejecutar el test nuevo y verificar que falla**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/list.test.tsx`
Expected: FAIL en el test nuevo (hoy la card muestra el tipo en `.cardType`, no el `Badge` con label de categoría; la aserción de `getAllByText("Reportes")` puede pasar por `.cardType`, pero tras la reestructura el origen será el `Badge`). Si pasa de inmediato, continuar igual: el objetivo es la nueva estructura.

- [ ] **Step 3: Reescribir el render de `ItemList.tsx` (filas)**

Reemplazar el `return (...)` del componente `ItemList` (el `<ul>` con las cards) por:

```tsx
return (
  <>
    <ul className={styles.list} role="list">
      {items.map((item, index) => {
        const key = `${item.category}-${item.sourceId}-${item.externalId}`;
        const delayIndex = Math.min(index, MAX_STAGGER);
        const fecha = formatDateShort(item.firstSeenAt);
        const meta = CATEGORY_META[item.category];
        const colorVar = `var(${meta.colorVar})`;

        return (
          <li
            key={key}
            className={styles.row}
            style={
              {
                "--stagger-i": delayIndex,
                "--cat": colorVar,
              } as React.CSSProperties
            }
          >
            <span
              className={styles.dot}
              style={{ color: colorVar }}
              aria-hidden="true"
            />

            <div className={styles.body}>
              <button
                type="button"
                className={styles.main}
                onClick={() => setSelected(item)}
              >
                <Badge category={item.category} />
                <span className={styles.title}>{item.titulo}</span>
                {item.texto && (
                  <span className={styles.text}>{item.texto}</span>
                )}
              </button>

              <div className={styles.meta}>
                {item.ubicacion?.nombre && (
                  <span className={styles.metaItem}>
                    <MapPin aria-hidden="true" size={13} weight="fill" />
                    {item.ubicacion.nombre}
                  </span>
                )}
                {fecha && (
                  <span className={styles.metaItem}>
                    <Clock aria-hidden="true" size={13} />
                    {fecha}
                  </span>
                )}
                <span className={styles.metaItem}>
                  Fuente: <Source sourceId={item.sourceId} />
                </span>
              </div>
            </div>

            <CaretRight
              className={styles.go}
              aria-hidden="true"
              size={18}
              weight="bold"
            />
          </li>
        );
      })}
    </ul>

    {selected && (
      <ItemDetail item={selected} onClose={() => setSelected(null)} />
    )}
  </>
);
```

(El `import` de iconos `MapPin, Clock, CaretRight` ya existe en el archivo; `Badge`, `Source`, `Modal`, `CATEGORY_META` y los formateadores también. La función `ItemDetail` y el `useState` de `selected` no cambian.)

- [ ] **Step 4: Reescribir los estilos de fila en `ItemList.module.css`**

Reemplazar todo lo que va desde el comentario `/* Grid: ... */` y las reglas de `.card*` (desde la línea de `.list` hasta antes de `/* ── Detail modal content ── */`) por las reglas de fila. **Conservar intactas** las reglas del modal (`.detail`, `.detailTitle`, `.detailMeta`, `.detailMetaItem`, `.detailText`, `.detailFoot`). El bloque nuevo:

```css
/* ItemList — filas densas editoriales. Color = punto + badge. */
.list {
  list-style: none;
  margin: 0 auto;
  padding: 0;
  max-width: var(--readw);
  border-top: 1px solid var(--border);
}

@keyframes rowIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: start;
  padding: 18px 8px;
  border-bottom: 1px solid var(--border);
  transition: background 150ms ease;
  animation: rowIn 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(20ms + var(--stagger-i, 0) * 40ms);
}

.row:hover {
  background: var(--surface);
}

.dot {
  margin-top: 7px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: currentColor;
  box-shadow:
    0 0 0 3px var(--bg),
    0 0 0 4px currentColor;
}

.body {
  min-width: 0;
}

.main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  width: 100%;
  margin: 0;
  padding: 0;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.main:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: 6px;
}

.title {
  font-size: 1.06rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink-strong);
  line-height: 1.3;
}

.text {
  color: var(--ink);
  font-size: 0.95rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: 10px;
  color: var(--muted);
  font-size: 0.82rem;
}

.metaItem {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.metaItem svg {
  flex-shrink: 0;
  color: var(--border-strong);
}

.go {
  align-self: center;
  color: var(--border-strong);
  transition:
    color 150ms ease,
    transform 150ms ease;
  flex: none;
}

.row:hover .go {
  color: var(--primary);
  transform: translateX(2px);
}

@media (max-width: 560px) {
  .row {
    grid-template-columns: auto 1fr;
  }
  .go {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .row {
    animation: none;
    transition: none;
  }
  .row:hover .go {
    transition: none;
  }
}
```

- [ ] **Step 5: Ejecutar los tests de la lista y verificar verde**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/list.test.tsx`
Expected: PASS (lista, conteo de items, títulos, fuente, ubicación, fecha, botón→dialog, cerrar dialog, badge por fila).

- [ ] **Step 6: Verificar la suite completa (App usa ItemList)**

Run: `npm test --workspace @venezuelahelp/frontend-public`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend-public/src/components/ItemList.tsx frontend-public/src/components/ItemList.module.css frontend-public/src/components/__tests__/list.test.tsx
git commit -m "$(printf '🎨 feat(frontend-public): lista en filas densas con punto y badge de categoría\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: FilterBar — chips con punto de color

**Files:**

- Modify: `src/components/FilterBar.tsx`
- Modify: `src/components/FilterBar.module.css`
- Test (debe seguir verde): `src/components/__tests__/filters.test.tsx`, `src/__tests__/app.test.tsx`

**Interfaces:**

- Consumes: `CATEGORY_META`, `CATEGORY_ORDER`; tokens de Task 1.
- Produces: `FilterBar` con las MISMAS props. Cada chip mantiene `aria-pressed`, el nombre accesible con la etiqueta de categoría (p. ej. "Reportes") y el conteo (requerido por `filters.test.tsx` y `app.test.tsx`). El buscador conserva `type="search"` y `aria-label="Buscar"`.

- [ ] **Step 1: Fijar la base verde de los filtros**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/filters.test.tsx`
Expected: PASS.

- [ ] **Step 2: Cambiar el icono del chip por un punto de color**

En `src/components/FilterBar.tsx`, dentro del `.map` de `CATEGORY_ORDER`, reemplazar el `<Icon ... />` por un punto y mantener label y conteo:

```tsx
<button
  key={cat}
  type="button"
  className={`${styles.chip} ${isActive ? styles.chipActive : ""}`}
  aria-pressed={isActive}
  onClick={() => onToggle(cat)}
  style={{ "--chip-color": colorVar } as React.CSSProperties}
>
  <span className={styles.chipDot} aria-hidden="true" />
  <span className={styles.chipLabel}>{meta.label}</span>
  <span className={styles.chipCount}>{counts[cat]}</span>
</button>
```

Eliminar el `import` de iconos de categoría ya no usado dentro del map (`const Icon = meta.icon;` y el JSX `<Icon .../>`). Mantener `Funnel`, `CaretDown` (del botón "Filtros").

- [ ] **Step 3: Estilar el punto del chip y el carrusel en `FilterBar.module.css`**

Añadir/ajustar en `FilterBar.module.css`:

```css
.chipDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--chip-color);
}
```

Y asegurar el estado activo del chip (si no existe ya, ajustar `.chipActive`):

```css
.chipActive {
  background: var(--primary-tint);
  border-color: var(--primary);
  color: var(--primary-strong);
}
```

(Conservar el comportamiento responsivo existente de `.chips`/colapso "Filtros"; no introducir scroll horizontal de página.)

- [ ] **Step 4: Verificar filtros y App verdes**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/components/__tests__/filters.test.tsx src/__tests__/app.test.tsx`
Expected: PASS (chips con `aria-pressed`, label y conteo intactos; toggle por categoría sigue funcionando).

- [ ] **Step 5: Commit**

```bash
git add frontend-public/src/components/FilterBar.tsx frontend-public/src/components/FilterBar.module.css
git commit -m "$(printf '🎨 feat(frontend-public): chips de filtro con punto de color de categoría\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: Footer — superficie secundaria

**Files:**

- Modify: `src/components/Footer.module.css`
- Test (debe seguir verde): `src/__tests__/app.test.tsx`

**Interfaces:**

- Consumes: tokens de Task 1.
- Produces: sin cambios de markup ni props (`Footer.tsx` ya renderiza "Fuentes monitoreadas", chips de fuente con conteo, "Datos actualizados:" y el disclaimer). Solo estilo.

- [ ] **Step 1: Aplicar la superficie secundaria y refinar los chips de fuente**

En `src/components/Footer.module.css`, asegurar que `.footer` use el fondo secundario y borde superior:

```css
.footer {
  margin-top: 40px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
```

Y que los chips de fuente (`.item`/`.link`) sean pastillas sobre `--bg` con borde `--border` (sin combinar con sombra ≥16px). Ajustar `.item`:

```css
.item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink-strong);
}
```

(Si el `.module.css` ya define `.item`/`.link` con otra forma, alinear a esta pastilla; conservar `.count`, `.updated`, `.disclaimer` con `--muted`.)

- [ ] **Step 2: Verificar que App sigue verde**

Run: `npm test --workspace @venezuelahelp/frontend-public -- src/__tests__/app.test.tsx`
Expected: PASS (markup del Footer sin cambios; `/Datos actualizados/i` presente).

- [ ] **Step 3: Commit**

```bash
git add frontend-public/src/components/Footer.module.css
git commit -m "$(printf '🎨 style(frontend-public): footer sobre superficie secundaria con fuentes en pastilla\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 8: Verificación responsiva, visual y build

**Files:** ninguno nuevo (ajustes puntuales de CSS si una captura revela un defecto).

**Interfaces:** entrega final verificada por evidencia (capturas) en 4 breakpoints.

- [ ] **Step 1: Suite completa verde**

Run: `npm test --workspace @venezuelahelp/frontend-public`
Expected: PASS (toda la suite).

- [ ] **Step 2: Build de producción**

Run: `npm run build --workspace @venezuelahelp/frontend-public`
Expected: build exitoso, sin errores de TypeScript ni de Vite.

- [ ] **Step 3: Levantar el dev server**

Run (background): `npm run dev --workspace @venezuelahelp/frontend-public`
Expected: Vite en `http://localhost:5173/`.

- [ ] **Step 4: Capturar y revisar 4 breakpoints**

Con la herramienta de navegador disponible (agent-browser), capturar `http://localhost:5173/` a 320, 375, 768 y 1440 px de ancho, en la vista Lista (y abrir el toggle Mapa una vez para confirmar que carga). Revisar cada captura contra esta checklist:

- Sin scroll horizontal de página en 320 y 375.
- El titular del Hero no desborda en 320 (si desborda, bajar el `clamp()` max de `.title` o acortar el copy).
- El CTA a Telegram visible en el Header en todos los anchos (texto "Telegram" en ≤380px).
- Chips de filtro desplazables horizontalmente sin romper el layout.
- Filas: punto + badge + título + texto (2 líneas) + meta legibles; chevron oculto en ≤560px.
- Contraste de badges y meta legible (AA).

- [ ] **Step 5: Corregir defectos detectados (si los hay) y volver a capturar**

Aplicar los ajustes mínimos de CSS necesarios y repetir Step 4 hasta que la checklist pase. Si no hubo defectos, continuar.

- [ ] **Step 6: Commit final (si hubo ajustes) y cierre**

```bash
git add -A frontend-public/src
git commit -m "$(printf '💄 polish(frontend-public): ajustes responsivos tras verificación visual\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

(Si no hubo ajustes, omitir el commit.)

---

## Nota de despliegue (fuera del alcance de la implementación)

El frontend público se publica con **`VenezuelaHelpFrontendStack`** desde `frontend-public/dist` (un `BucketDeployment` sube e invalida CloudFront). Para desplegar este rediseño: buildear `frontend-public` y desplegar esa stack (ver `CLAUDE.md` → sección AWS / "Qué stack desplegar"). El backend y el `snapshot.json` no cambian.

## Self-review (cobertura del spec)

- §3 Arquitectura de página → Tasks 3, 4 (Hero + composición + baja de SourceBanner).
- §4 Tokens → Task 1.
- §5 Responsividad → Tasks 2 (Header), 5 (filas), 6 (chips), 8 (verificación 4 breakpoints).
- §6 Componentes (Header, Hero, FilterBar, ItemList, SourceBanner, Footer, Badge, App, tokens, main) → Tasks 1–7.
- §7 Accesibilidad → conservación de `aria-pressed`/foco/nombres accesibles en cada task; `prefers-reduced-motion` en Hero (T3) e ItemList (T5).
- §8 Testing → tests actualizados/creados en T3 (Hero), T5 (filas); baja de SourceBanner sin test que borrar (T4); verificación visual en T8.
- §9 Riesgos → tests acoplados al DOM (T5), contraste (T5/T8), overflow del Hero (T8).

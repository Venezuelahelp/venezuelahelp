// src/components/Hero.tsx
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { formatDateTime } from "@/data/datetime";
import { CATEGORY_META, CATEGORY_ORDER } from "@/data/categories";
import type { Category } from "@/types";
import styles from "./Hero.module.css";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

interface HeroProps {
  total: number;
  sourceCount: number;
  counts: Record<Category, number>;
  generatedAt?: string;
}

export default function Hero({
  total,
  sourceCount,
  counts,
  generatedAt,
}: HeroProps) {
  const updated = formatDateTime(generatedAt);
  // Escala las barras respecto a la categoría más numerosa (no al total): así
  // la categoría líder llena la barra y las pequeñas siguen siendo visibles.
  const max = Math.max(1, ...CATEGORY_ORDER.map((c) => counts[c] ?? 0));

  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div className={styles.lead}>
            <span className={styles.pill}>
              <span className={styles.pulse} aria-hidden="true" />
              Actualizado con fuentes públicas
            </span>

            <h1 className={styles.title}>
              La información del terremoto, reunida en un solo lugar.
            </h1>

            <p className={styles.lede}>
              Reportes, personas desaparecidas, centros de acopio, edificios
              dañados y solicitudes de ayuda, recopilados de fuentes públicas.
              Pregunta lo que necesites al bot de Telegram en lenguaje natural.
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

          {/* Resumen por categoría (DESIGN.md: barra compacta de conteos, no
              hero-metric gigante). Solo desktop: en móvil los chips del filtro
              ya muestran los conteos, así evitamos duplicarlos. */}
          <aside className={styles.panel} aria-label="Resumen por categoría">
            <div className={styles.panelHead}>
              <span className={styles.panelLabel}>Registros recopilados</span>
              <span className={styles.panelTotal}>{total}</span>
            </div>

            <ul className={styles.stats}>
              {CATEGORY_ORDER.map((cat) => {
                const meta = CATEGORY_META[cat];
                const n = counts[cat] ?? 0;
                const pct = Math.round((n / max) * 100);
                const color = `var(${meta.colorVar})`;
                return (
                  <li key={cat} className={styles.statRow}>
                    <div className={styles.statTop}>
                      <span className={styles.statName}>
                        <span
                          className={styles.statDot}
                          style={{ background: color }}
                          aria-hidden="true"
                        />
                        {meta.label}
                      </span>
                      <span className={styles.statCount}>{n}</span>
                    </div>
                    <span className={styles.statTrack} aria-hidden="true">
                      <span
                        className={styles.statFill}
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>

            {updated && (
              <p className={styles.panelFoot}>Última actualización · {updated}</p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

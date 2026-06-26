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

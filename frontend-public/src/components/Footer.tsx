import { ArrowUpRight } from "@phosphor-icons/react";
import { resolveSource } from "@/data/sources";
import styles from "./Footer.module.css";

interface FooterProps {
  sources: { sourceId: string; count: number }[];
}

export default function Footer({ sources }: FooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <h2 className={styles.title}>Fuentes monitoreadas</h2>
        <p className={styles.sub}>
          La información se recopila de páginas públicas de terceros:
        </p>

        <ul className={styles.list}>
          {sources.map(({ sourceId, count }) => {
            const src = resolveSource(sourceId);
            return (
              <li key={sourceId} className={styles.item}>
                {src.url ? (
                  <a
                    className={styles.link}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {src.nombre}
                    <ArrowUpRight aria-hidden="true" size={13} weight="bold" />
                  </a>
                ) : (
                  <span className={styles.name}>{src.nombre}</span>
                )}
                <span className={styles.count} aria-label={`${count} elementos`}>
                  {count}
                </span>
              </li>
            );
          })}
        </ul>

        <p className={styles.disclaimer}>
          VenezuelaHelp agrega información de emergencia desde fuentes abiertas.
          No es una fuente oficial; verifica siempre con las autoridades.
        </p>
      </div>
    </footer>
  );
}

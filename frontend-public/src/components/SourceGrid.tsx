import { ArrowUpRight } from "@phosphor-icons/react";
import { useResolveSource } from "@/data/sources";
import type { Category } from "@/types";
import styles from "./SourceGrid.module.css";

const CAT_LABEL: Record<Category, string> = {
  reportes: "Reportes",
  desaparecidos: "Desaparecidos",
  acopios: "Acopios",
  edificios: "Edificios",
  hospitales: "Hospitales",
  solicitudes: "Solicitudes",
};

const nf = new Intl.NumberFormat("es");

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface SourceGridProps {
  sources: { sourceId: string; count: number; cats: Category[] }[];
}

function Chips({ cats }: { cats: Category[] }) {
  const shown = cats.slice(0, 3);
  const extra = cats.length - shown.length;
  return (
    <div className={styles.chips}>
      {shown.map((c) => (
        <span key={c} className={styles.chip} data-cat={c}>
          {CAT_LABEL[c]}
        </span>
      ))}
      {extra > 0 && (
        <span className={`${styles.chip} ${styles.more}`}>+{extra}</span>
      )}
    </div>
  );
}

export default function SourceGrid({ sources }: SourceGridProps) {
  const resolve = useResolveSource();
  return (
    <ul className={styles.grid} role="list">
      {sources.map(({ sourceId, count, cats }) => {
        const src = resolve(sourceId);
        const formatted = nf.format(count);
        return (
          <li key={sourceId}>
            {src.url ? (
              <a
                className={styles.card}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className={styles.head}>
                  <img
                    className={styles.favicon}
                    alt=""
                    loading="lazy"
                    src={`https://www.google.com/s2/favicons?domain=${domainOf(src.url)}&sz=64`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span className={styles.name}>{src.nombre}</span>
                  <span
                    className={styles.count}
                    aria-label={`${count} registros`}
                  >
                    {formatted}
                  </span>
                </div>
                <span className={styles.url}>
                  <ArrowUpRight aria-hidden="true" size={13} weight="bold" />
                  {src.url}
                </span>
                {cats.length > 0 && <Chips cats={cats} />}
              </a>
            ) : (
              <div className={styles.card}>
                <div className={styles.head}>
                  <span className={styles.name}>{src.nombre}</span>
                  <span
                    className={styles.count}
                    aria-label={`${count} registros`}
                  >
                    {formatted}
                  </span>
                </div>
                {cats.length > 0 && <Chips cats={cats} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

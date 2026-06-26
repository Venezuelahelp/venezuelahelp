import type { Source } from "@/types";
import styles from "./Sources.module.css";

interface SourcesProps {
  sources: Source[];
  onToggle: (id: string, enabled: boolean) => void;
  onScrape: () => void;
  scraping: boolean;
}

export function Sources({
  sources,
  onToggle,
  onScrape,
  scraping,
}: SourcesProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Fuentes</h2>
        <button
          type="button"
          onClick={onScrape}
          disabled={scraping}
          aria-busy={scraping}
          className={styles.scrapeButton}
        >
          {scraping ? "Scraping…" : "Scrape ahora"}
        </button>
      </div>

      <ul className={styles.sourceList} role="list">
        {sources.map((src) => (
          <li key={src.id} className={styles.sourceRow}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                className={styles.toggle}
                checked={src.enabled}
                onChange={() => onToggle(src.id, !src.enabled)}
              />
              <span className={styles.sourceName}>{src.nombre}</span>
            </label>
            <span className={styles.url}>{src.url}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

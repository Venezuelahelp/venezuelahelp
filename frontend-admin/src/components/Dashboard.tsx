import type { Stats } from "@/types";
import { CATEGORIES } from "@/categories";
import styles from "./Dashboard.module.css";

interface DashboardProps {
  stats: Stats;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function formatRun(iso?: string): string {
  if (!iso) return "nunca";
  try {
    return new Date(iso).toLocaleString("es-VE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function Dashboard({ stats, onRefresh, refreshing }: DashboardProps) {
  return (
    <div className={styles.root}>
      {onRefresh && (
        <div className={styles.toolbar}>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
            className={styles.refreshButton}
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>Conteos por categoría</h2>
        <ul className={styles.categoryList} role="list">
          {CATEGORIES.map(({ key, label, colorVar }) => (
            <li key={key} className={styles.categoryRow}>
              <span
                className={styles.dot}
                style={{ backgroundColor: `var(${colorVar})` }}
                aria-hidden="true"
              />
              <span className={styles.categoryLabel}>{label}</span>
              <span className={styles.count}>{stats.counts[key] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Estado de fuentes</h2>
        <ul className={styles.sourceList} role="list">
          {stats.sources.map((src) => (
            <li key={src.id} className={styles.sourceRow}>
              <span className={styles.sourceName}>{src.nombre}</span>
              <span
                className={styles.sourceStatus}
                data-status={src.lastStatus ?? "none"}
              >
                {src.lastStatus ?? "—"}
              </span>
              <span className={styles.sourceRun}>{formatRun(src.lastRun)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

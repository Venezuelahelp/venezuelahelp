import type { ScrapeRun, Stats } from "@/types";
import { CATEGORIES } from "@/categories";
import styles from "./Dashboard.module.css";

interface DashboardProps {
  stats: Stats;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrapeRateMin?: number;
  scrapeRuns?: ScrapeRun[] | null;
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

function ageMinutes(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
}

function formatAge(min: number): string {
  return min < 120 ? `${min} min` : `${Math.round(min / 60)} h`;
}

function formatDuration(ms: number): string {
  return ms < 90000
    ? `${Math.round(ms / 1000)} s`
    : `${Math.round(ms / 60000)} min`;
}

export function Dashboard({
  stats,
  onRefresh,
  refreshing,
  scrapeRateMin,
  scrapeRuns,
}: DashboardProps) {
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

      {stats.snapshotUpdatedAt &&
        (() => {
          const age = ageMinutes(stats.snapshotUpdatedAt);
          const rate = scrapeRateMin ?? 30;
          const stale = age > 2 * rate;
          return (
            <section className={styles.section}>
              <h2 className={styles.heading}>Snapshot público</h2>
              <p
                className={stale ? styles.snapshotStale : styles.snapshotOk}
                role={stale ? "alert" : undefined}
              >
                Actualizado hace {formatAge(age)}
                {stale &&
                  ` — supera 2× el intervalo de scrape (${rate} min); revisar el scraper.`}
              </p>
            </section>
          );
        })()}

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

      {scrapeRuns && scrapeRuns.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Últimos scrapes</h2>
          {/* Altura acotada + scroll propio (convención del proyecto). */}
          <div className={styles.runsWrap}>
            <table className={styles.runsTable}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Duración</th>
                  <th scope="col">Fuentes</th>
                  <th scope="col">Ítems</th>
                </tr>
              </thead>
              <tbody>
                {scrapeRuns.map((r) => (
                  <tr key={r.ts}>
                    <td>{formatRun(r.ts)}</td>
                    <td>{formatDuration(r.durationMs)}</td>
                    <td>
                      <span className={styles.runOk}>{r.sourcesOk} ok</span>
                      {r.sourcesError > 0 && (
                        <span className={styles.runError}>
                          {" "}
                          · {r.sourcesError} error
                        </span>
                      )}
                    </td>
                    <td>
                      {r.created} nuevos · {r.updated} actualizados
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

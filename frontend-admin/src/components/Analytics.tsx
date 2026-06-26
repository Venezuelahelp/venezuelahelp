import type { Analytics as AnalyticsData, DimCount } from "@/types";
import styles from "./Analytics.module.css";

interface AnalyticsProps {
  data: AnalyticsData;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function Breakdown({ title, rows }: { title: string; rows: DimCount[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  return (
    <section className={styles.section}>
      <h3 className={styles.subheading}>{title}</h3>
      {rows.length === 0 ? (
        <p className={styles.empty}>Sin datos aún.</p>
      ) : (
        <ul className={styles.barList} role="list">
          {rows.map((r) => (
            <li key={r.key} className={styles.barRow}>
              <span className={styles.barLabel}>{r.key || "—"}</span>
              <span className={styles.barTrack} aria-hidden="true">
                <span
                  className={styles.barFill}
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </span>
              <span className={styles.barCount}>{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Analytics({ data, onRefresh, refreshing }: AnalyticsProps) {
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
        <h2 className={styles.heading}>Visitas</h2>
        <ul className={styles.kpiRow} role="list">
          <li className={styles.kpi}>
            <span className={styles.kpiValue}>{data.kpis.today}</span>
            <span className={styles.kpiLabel}>Hoy</span>
          </li>
          <li className={styles.kpi}>
            <span className={styles.kpiValue}>{data.kpis.last7}</span>
            <span className={styles.kpiLabel}>Últimos 7 días</span>
          </li>
          <li className={styles.kpi}>
            <span className={styles.kpiValue}>{data.kpis.last30}</span>
            <span className={styles.kpiLabel}>Últimos 30 días</span>
          </li>
        </ul>
      </section>

      <Breakdown title="Por país" rows={data.byCountry} />
      <Breakdown title="Por navegador" rows={data.byBrowser} />
      <Breakdown title="Por dispositivo" rows={data.byDevice} />

      <section className={styles.section}>
        <h3 className={styles.subheading}>Visitas recientes</h3>
        {data.recent.length === 0 ? (
          <p className={styles.empty}>Aún no hay visitas registradas.</p>
        ) : (
          <ul className={styles.recentList} role="list">
            {data.recent.map((v) => (
              <li key={v.ts} className={styles.recentRow}>
                <span className={styles.recentWhen}>{formatTs(v.ts)}</span>
                <span className={styles.recentTag}>{v.country}</span>
                <span className={styles.recentTag}>{v.browser}</span>
                <span className={styles.recentTag}>{v.device}</span>
                <span className={styles.recentPath}>{v.path || "/"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

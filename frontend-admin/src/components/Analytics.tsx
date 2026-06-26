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
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// "ES" → "España" (en español). Desconocido para ZZ/vacío.
function countryName(code: string): string {
  if (!code || code === "ZZ") return "Desconocido";
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "region" });
    return dn.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

// "ES" → 🇪🇸 (indicadores regionales). Bandera neutra si no aplica.
function countryFlag(code: string): string {
  const cc = (code ?? "").toUpperCase();
  if (cc.length !== 2 || cc === "ZZ" || !/^[A-Z]{2}$/.test(cc)) return "🏳️";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + cc.charCodeAt(0) - 65,
    base + cc.charCodeAt(1) - 65,
  );
}

function Breakdown({
  title,
  rows,
  country = false,
}: {
  title: string;
  rows: DimCount[];
  country?: boolean;
}) {
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
              <span className={styles.barLabel}>
                {country ? (
                  <>
                    <span className={styles.flag} aria-hidden="true">
                      {countryFlag(r.key)}
                    </span>
                    {countryName(r.key)}
                  </>
                ) : (
                  r.key || "—"
                )}
              </span>
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

      <Breakdown title="Por país" rows={data.byCountry} country />
      <Breakdown title="Por navegador" rows={data.byBrowser} />
      <Breakdown title="Por dispositivo" rows={data.byDevice} />

      <section className={styles.section}>
        <div className={styles.recentHead}>
          <h3 className={styles.subheading}>Visitas recientes</h3>
          {data.recent.length > 0 && (
            <span className={styles.recentCount}>
              {data.recent.length} más recientes
            </span>
          )}
        </div>
        {data.recent.length === 0 ? (
          <p className={styles.empty}>Aún no hay visitas registradas.</p>
        ) : (
          // Región acotada con scroll propio: la página no crece sin fin por
          // muchas visitas que haya.
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">País</th>
                  <th scope="col">Navegador</th>
                  <th scope="col">Dispositivo</th>
                  <th scope="col">Página</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((v) => (
                  <tr key={v.ts}>
                    <td className={styles.cellWhen}>{formatTs(v.ts)}</td>
                    <td className={styles.cellCountry}>
                      <span className={styles.flag} aria-hidden="true">
                        {countryFlag(v.country)}
                      </span>
                      <span className={styles.countryCode}>
                        {v.country || "ZZ"}
                      </span>
                    </td>
                    <td>{v.browser}</td>
                    <td>{v.device}</td>
                    <td className={styles.cellPath} title={v.path}>
                      {v.path || "/"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

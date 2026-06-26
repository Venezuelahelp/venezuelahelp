import styles from "./ViewToggle.module.css";

export type View = "lista" | "mapa";

interface ViewToggleProps {
  view: View;
  onChange: (v: View) => void;
  mapCount: number;
}

/**
 * Segmented control to switch between the list and the map view (all
 * viewports). The list is the default; the map is opt-in, so Leaflet only
 * mounts when the user asks for it (lighter on slow connections).
 */
export default function ViewToggle({
  view,
  onChange,
  mapCount,
}: ViewToggleProps) {
  return (
    <div className={styles.root} role="tablist" aria-label="Ver como">
      <button
        type="button"
        role="tab"
        aria-selected={view === "lista"}
        className={styles.tab}
        onClick={() => onChange("lista")}
      >
        Lista
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "mapa"}
        className={styles.tab}
        onClick={() => onChange("mapa")}
      >
        Mapa
        <span className={styles.count} aria-hidden="true">
          {mapCount}
        </span>
      </button>
    </div>
  );
}

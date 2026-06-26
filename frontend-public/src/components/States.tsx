import styles from "./States.module.css";

// --------------- Loading (skeleton) ---------------

export function Loading() {
  return (
    <div className={styles.loadingRoot} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonBadge} />
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonText} />
        </div>
      ))}
    </div>
  );
}

// --------------- Empty ---------------

interface EmptyProps {
  query?: string;
}

export function Empty({ query }: EmptyProps) {
  return (
    <div className={styles.emptyRoot}>
      <p className={styles.emptyMessage}>
        {query ? `No hay resultados para «${query}».` : "No hay resultados."}
      </p>
    </div>
  );
}

// --------------- ErrorState ---------------

interface ErrorStateProps {
  onRetry: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className={styles.errorRoot}>
      <p className={styles.errorMessage}>No pudimos cargar los datos.</p>
      <button className={styles.retryBtn} type="button" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

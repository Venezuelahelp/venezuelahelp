import type { Category } from "@/types";
import CategoryFilter from "@/components/CategoryFilter";
import styles from "./FilterBar.module.css";

interface FilterBarProps {
  query: string;
  onQuery: (q: string) => void;
  active: Set<Category>;
  onToggle: (c: Category) => void;
  counts: Record<Category, number>;
  resultCount: number;
  total: number;
  onClear: () => void;
}

export default function FilterBar({
  query,
  onQuery,
  active,
  onToggle,
  counts,
  resultCount,
  total,
  onClear,
}: FilterBarProps) {
  const hasFilters = query.trim().length > 0 || active.size > 0;

  return (
    <div className={styles.root}>
      <input
        className={styles.search}
        type="search"
        aria-label="Buscar"
        placeholder="Buscar por palabra clave…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />

      <CategoryFilter active={active} onToggle={onToggle} counts={counts} />

      <div className={styles.results}>
        <p className={styles.resultsCount} aria-live="polite">
          {hasFilters ? (
            <>
              <strong>{resultCount}</strong> de {total} resultados
            </>
          ) : (
            <>
              <strong>{total}</strong> resultados
            </>
          )}
        </p>
        {hasFilters && (
          <button type="button" className={styles.clear} onClick={onClear}>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

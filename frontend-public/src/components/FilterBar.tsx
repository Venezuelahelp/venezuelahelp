import type { Category, SortMode, StatusFilter } from "@/types";
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
  matchActive: boolean;
  onToggleMatch: () => void;
  matchCount: number;
  /** Sub-filtro de status (solo con desaparecidos activa y snapshot con statusClass). */
  statusFilter?: StatusFilter;
  onStatusFilter?: (s: StatusFilter) => void;
  showStatusFilter?: boolean;
  /** Ordenación de resultados (default "relevancia"). */
  sort?: SortMode;
  onSort?: (s: SortMode) => void;
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
  matchActive,
  onToggleMatch,
  matchCount,
  statusFilter = "todos",
  onStatusFilter,
  showStatusFilter = false,
  sort = "relevancia",
  onSort,
}: FilterBarProps) {
  const hasFilters = query.trim().length > 0 || active.size > 0 || matchActive;

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

      <CategoryFilter
        active={active}
        onToggle={onToggle}
        counts={counts}
        matchActive={matchActive}
        onToggleMatch={onToggleMatch}
        matchCount={matchCount}
      />

      {showStatusFilter && onStatusFilter && (
        <div
          className={styles.statusGroup}
          role="group"
          aria-label="Filtrar desaparecidos por estado"
        >
          {(
            [
              ["todos", "Todos"],
              ["buscando", "Buscando"],
              ["localizado", "Localizados"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`${styles.statusBtn} ${
                statusFilter === value ? styles.statusBtnActive : ""
              }`}
              aria-pressed={statusFilter === value}
              onClick={() => onStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.results}>
        <p className={styles.resultsCount} aria-live="polite">
          {matchActive ? (
            <>
              <strong>{matchCount}</strong> posibles localizaciones
            </>
          ) : hasFilters ? (
            <>
              <strong>{resultCount}</strong> de {total} resultados
            </>
          ) : (
            <>
              <strong>{total}</strong> resultados
            </>
          )}
        </p>
        {!matchActive && onSort && (
          <label className={styles.sortLabel}>
            Ordenar:
            <select
              className={styles.sortSelect}
              aria-label="Ordenar resultados"
              value={sort}
              onChange={(e) => onSort(e.target.value as SortMode)}
            >
              <option value="relevancia">Relevancia</option>
              <option value="recientes">Más recientes</option>
              <option value="corroborados">Más corroborados</option>
            </select>
          </label>
        )}
        {hasFilters && (
          <button type="button" className={styles.clear} onClick={onClear}>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

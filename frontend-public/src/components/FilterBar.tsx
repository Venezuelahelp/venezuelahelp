import { useState } from "react";
import type { Category } from "@/types";
import { Funnel, CaretDown } from "@phosphor-icons/react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/data/categories";
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

const CHIPS_ID = "filter-chips";

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
  const [open, setOpen] = useState(false);
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

      {/* Mobile-only collapse trigger (hidden on desktop via CSS) */}
      <button
        type="button"
        className={styles.filtersToggle}
        aria-expanded={open}
        aria-controls={CHIPS_ID}
        onClick={() => setOpen((v) => !v)}
      >
        <Funnel aria-hidden="true" size={16} weight="fill" />
        Filtros
        {active.size > 0 && (
          <span className={styles.filtersCount}>{active.size}</span>
        )}
        <CaretDown
          className={`${styles.caret} ${open ? styles.caretOpen : ""}`}
          aria-hidden="true"
          size={14}
          weight="bold"
        />
      </button>

      <div
        id={CHIPS_ID}
        className={`${styles.chips} ${open ? styles.chipsOpen : ""}`}
        role="group"
        aria-label="Filtrar por categoría"
      >
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = active.has(cat);
          const colorVar = `var(${meta.colorVar})`;
          const Icon = meta.icon;
          return (
            <button
              key={cat}
              type="button"
              className={`${styles.chip} ${isActive ? styles.chipActive : ""}`}
              aria-pressed={isActive}
              onClick={() => onToggle(cat)}
              style={{ "--chip-color": colorVar } as React.CSSProperties}
            >
              <Icon
                className={styles.icon}
                weight={isActive ? "fill" : "regular"}
                aria-hidden="true"
                size={16}
              />
              <span className={styles.chipLabel}>{meta.label}</span>
              <span className={styles.chipCount}>{counts[cat]}</span>
            </button>
          );
        })}
      </div>

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

import type { Category } from "@/types";
import { CATEGORY_META, CATEGORY_ORDER } from "@/data/categories";
import styles from "./CategoryFilter.module.css";

interface Props {
  active: Set<Category>;
  onToggle: (c: Category) => void;
  counts: Record<Category, number>;
  /** Sin encabezado y tarjetas más chicas (para el overlay del mapa). */
  compact?: boolean;
}

export default function CategoryFilter({
  active,
  onToggle,
  counts,
  compact = false,
}: Props) {
  return (
    <div className={compact ? styles.compact : undefined}>
      {!compact && (
        <p className={styles.header}>
          Filtra las necesidades de ayuda por categoría
        </p>
      )}
      <div
        className={styles.cards}
        role="group"
        aria-label="Filtrar por categoría"
      >
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const isActive = active.has(cat);
          const colorVar = `var(${meta.colorVar})`;
          return (
            <button
              key={cat}
              type="button"
              className={`${styles.card} ${isActive ? styles.cardActive : ""}`}
              aria-pressed={isActive}
              onClick={() => onToggle(cat)}
              style={{ "--card-color": colorVar } as React.CSSProperties}
            >
              <span className={styles.cardIcon} aria-hidden="true">
                <Icon size={compact ? 20 : 26} weight="duotone" />
              </span>
              <span className={styles.cardLabel}>{meta.label}</span>
              <span className={styles.cardCount}>{counts[cat]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

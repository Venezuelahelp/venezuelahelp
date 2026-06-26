import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import styles from "./Pagination.module.css";

/**
 * Compact page list with a window around the current page and ellipses, e.g.
 * [1, "…", 49, 50, 51, "…", 179]. Shows every page when there are ≤7.
 */
export function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const wanted = new Set<number>([
    1,
    total,
    current - 1,
    current,
    current + 1,
  ]);
  const pages = [...wanted]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label?: string;
  compact?: boolean;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
  label = "Paginación de resultados",
  compact = false,
}: PaginationProps) {
  const tokens = pageList(page, totalPages);

  return (
    <nav
      className={`${styles.root} ${compact ? styles.compact : ""}`}
      aria-label={label}
    >
      <button
        type="button"
        className={styles.arrow}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Página anterior"
      >
        <CaretLeft size={16} weight="bold" aria-hidden="true" />
      </button>

      <ul className={styles.pages}>
        {tokens.map((tok, i) =>
          tok === "…" ? (
            <li key={`gap-${i}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={tok}>
              <button
                type="button"
                className={styles.page}
                aria-label={`Página ${tok}`}
                aria-current={tok === page ? "page" : undefined}
                onClick={() => onChange(tok)}
              >
                {tok}
              </button>
            </li>
          ),
        )}
      </ul>

      <button
        type="button"
        className={styles.arrow}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Página siguiente"
      >
        <CaretRight size={16} weight="bold" aria-hidden="true" />
      </button>
    </nav>
  );
}

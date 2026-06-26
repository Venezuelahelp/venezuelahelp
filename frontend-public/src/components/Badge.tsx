import type { Category } from "@/types";
import { CATEGORY_META } from "@/data/categories";
import styles from "./Badge.module.css";

interface BadgeProps {
  category: Category;
}

export default function Badge({ category }: BadgeProps) {
  const meta = CATEGORY_META[category];
  const colorVar = `var(${meta.colorVar})`;

  return (
    <span
      className={styles.badge}
      style={{
        color: colorVar,
        background: `color-mix(in oklch, ${colorVar} 12%, white)`,
      }}
    >
      {meta.label}
    </span>
  );
}

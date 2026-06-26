import type { Category } from "@/types";
import { CATEGORY_META } from "@/data/categories";
import styles from "./Badge.module.css";

interface BadgeProps {
  category: Category;
}

export default function Badge({ category }: BadgeProps) {
  const meta = CATEGORY_META[category];
  const colorVar = `var(${meta.colorVar})`;
  const Icon = meta.icon;

  return (
    <span
      className={styles.badge}
      style={{
        color: colorVar,
        background: `color-mix(in oklab, ${colorVar} 14%, white)`,
      }}
    >
      <Icon
        className={styles.icon}
        weight="fill"
        aria-hidden="true"
        size={14}
      />
      {meta.label}
    </span>
  );
}

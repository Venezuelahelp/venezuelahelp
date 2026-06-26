import { ArrowUpRight } from "@phosphor-icons/react";
import { resolveSource } from "@/data/sources";
import styles from "./Source.module.css";

interface SourceProps {
  sourceId: string;
}

/** Muestra la fuente de un ítem y enlaza a su sitio cuando la URL es conocida. */
export default function Source({ sourceId }: SourceProps) {
  const src = resolveSource(sourceId);

  if (src.url) {
    return (
      <a
        className={styles.source}
        href={src.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ver fuente en ${src.nombre} (abre en una pestaña nueva)`}
      >
        <span className={styles.label} aria-hidden="true">
          Fuente:
        </span>
        <span className={styles.name}>{src.nombre}</span>
        <ArrowUpRight aria-hidden="true" size={12} weight="bold" />
      </a>
    );
  }

  return (
    <span className={styles.source}>
      <span className={styles.label} aria-hidden="true">
        Fuente:
      </span>
      <span className={styles.name}>{src.nombre}</span>
    </span>
  );
}

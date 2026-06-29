import { ArrowUpRight } from "@phosphor-icons/react";
import { useResolveSource } from "@/data/sources";
import styles from "./Source.module.css";

interface SourceProps {
  sourceId: string;
  /** Permalink del ítem en su origen. Si está presente, el enlace va al ítem
   * concreto ("Ver original") en vez de a la home de la fuente. */
  sourceUrl?: string;
}

/** Muestra la fuente de un ítem y enlaza a su sitio cuando la URL es conocida. */
export default function Source({ sourceId, sourceUrl }: SourceProps) {
  const src = useResolveSource()(sourceId);
  // El permalink del ítem (origen real) gana a la home de la fuente.
  const href = sourceUrl ?? src.url;

  if (href) {
    const aimsAtItem = Boolean(sourceUrl);
    return (
      <a
        className={styles.source}
        href={href}
        target="_blank"
        rel={
          aimsAtItem ? "noopener noreferrer nofollow" : "noopener noreferrer"
        }
        aria-label={
          aimsAtItem
            ? `Ver original en ${src.nombre} (abre en una pestaña nueva)`
            : `Ver fuente en ${src.nombre} (abre en una pestaña nueva)`
        }
      >
        <span className={styles.label} aria-hidden="true">
          {aimsAtItem ? "Ver original:" : "Fuente:"}
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

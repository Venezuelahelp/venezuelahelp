import { formatDateTime } from "@/data/datetime";
import SourceGrid from "@/components/SourceGrid";
import { SourcesContext } from "@/data/sources";
import type { Category, SourceInfo } from "@/types";
import styles from "./SourcesPage.module.css";

interface SourcesPageProps {
  sources: { sourceId: string; count: number; cats: Category[] }[];
  // Directorio de fuentes del snapshot (id → nombre/url). SourceGrid lo lee vía
  // SourcesContext para resolver nombre y enlace de cada tarjeta.
  sourceDir: Record<string, SourceInfo> | undefined;
  generatedAt?: string;
}

export default function SourcesPage({
  sources,
  sourceDir,
  generatedAt,
}: SourcesPageProps) {
  const updated = formatDateTime(generatedAt);
  return (
    <SourcesContext.Provider value={sourceDir}>
      <section className={styles.page} aria-labelledby="fuentes-title">
        <h1 id="fuentes-title" className={styles.title}>
          Fuentes monitoreadas
        </h1>
        <p className={styles.sub}>
          La información se centraliza <strong>cada ~30 min</strong> desde estas{" "}
          {sources.length} páginas públicas de terceros. Toca cualquiera para ir
          al sitio de origen.
        </p>
        {updated && (
          <p className={styles.updated}>Datos actualizados: {updated}</p>
        )}
        <SourceGrid sources={sources} />
      </section>
    </SourcesContext.Provider>
  );
}

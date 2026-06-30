import Source from "./Source";
import styles from "./LocatedMatches.module.css";
import type { LocatedMatch } from "@/types";

/**
 * Sección "Posibles localizaciones": coincidencias automáticas entre personas
 * reportadas como buscadas y personas reportadas como localizadas/en hospital.
 * Verde = una fuente; azul = corroborado por varias. NUNCA afirma.
 */
export default function LocatedMatches({
  matches,
}: {
  matches: LocatedMatch[];
}) {
  if (!matches || matches.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Posibles localizaciones">
      <h2 className={styles.title}>Posibles localizaciones</h2>
      <p className={styles.disclaimer}>
        Estas son coincidencias automáticas por nombre entre reportes de
        personas buscadas y reportes de personas localizadas o ingresadas en
        hospitales. <strong>No son confirmaciones.</strong> Verifica siempre
        directamente con las fuentes antes de sacar conclusiones.
      </p>
      <ul className={styles.list}>
        {matches.map((m, i) => {
          const corroborated = m.locatedSourcesCount >= 2;
          return (
            <li
              key={`${m.nombre}-${i}`}
              className={corroborated ? styles.cardBlue : styles.cardGreen}
            >
              <div className={styles.head}>
                <span className={styles.name}>{m.nombre}</span>
                <span
                  className={corroborated ? styles.tagBlue : styles.tagGreen}
                >
                  {corroborated
                    ? `Localización corroborada por ${m.locatedSourcesCount} fuentes`
                    : "Posible localización"}
                </span>
              </div>
              <div className={styles.cols}>
                <div className={styles.col}>
                  <span className={styles.colLabel}>
                    Reportado como buscado
                  </span>
                  <p className={styles.text}>{m.missing.texto}</p>
                  <Source
                    sourceId={m.missing.sourceId}
                    sourceUrl={m.missing.sourceUrl}
                  />
                </div>
                <div className={styles.col}>
                  <span className={styles.colLabel}>
                    Reportado como localizado
                  </span>
                  <p className={styles.text}>{m.located.texto}</p>
                  <Source
                    sourceId={m.located.sourceId}
                    sourceUrl={m.located.sourceUrl}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

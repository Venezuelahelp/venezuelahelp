import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult, Source } from "@/types";
import { CATEGORIES } from "@/categories";
import styles from "./Search.module.css";

interface SearchProps {
  onSearch: (params: {
    q?: string;
    category?: string;
    limit?: number;
  }) => Promise<SearchResult>;
  sources?: Source[] | null;
}

const DEBOUNCE_MS = 300;

export function Search({ onSearch, sources }: SearchProps) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Secuencia para descartar respuestas fuera de orden (última búsqueda gana).
  const seqRef = useRef(0);

  const sourceHomes = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sources ?? []) map.set(s.id, s.url);
    return map;
  }, [sources]);

  useEffect(() => {
    if (q.trim() === "" && category === "") {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      onSearch({
        q: q.trim() || undefined,
        category: category || undefined,
        limit: 50,
      })
        .then((r) => {
          if (seqRef.current === seq) setResult(r);
        })
        .catch(() => {
          if (seqRef.current === seq) setError("No se pudo buscar.");
        })
        .finally(() => {
          if (seqRef.current === seq) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, category, onSearch]);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Buscar ítems</h2>
        {loading && (
          <span className={styles.loading} role="status">
            Buscando…
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <input
          type="search"
          className={styles.input}
          placeholder="Nombre, lugar, palabra clave…"
          aria-label="Buscar ítems"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={styles.select}
          aria-label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!error && result === null && (
        <p className={styles.empty}>
          Escribí un término o elegí una categoría para buscar en el snapshot.
        </p>
      )}

      {!error && result !== null && result.items.length === 0 && (
        <p className={styles.empty}>Sin resultados.</p>
      )}

      {!error && result !== null && result.items.length > 0 && (
        <>
          <p className={styles.total}>
            {result.total} resultado{result.total === 1 ? "" : "s"} (mostrando{" "}
            {result.items.length})
          </p>
          {/* Altura acotada + scroll propio (convención del proyecto). */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Fuente</th>
                  <th scope="col">Confianza</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Enlace" />
                </tr>
              </thead>
              <tbody>
                {result.items.map((it) => {
                  const href = it.sourceUrl ?? sourceHomes.get(it.sourceId);
                  return (
                    <tr key={`${it.sourceId}#${it.externalId}`}>
                      <td>
                        <div className={styles.titulo}>{it.titulo || "—"}</div>
                        <div className={styles.texto}>
                          {it.texto.slice(0, 120)}
                        </div>
                      </td>
                      <td className={styles.cell}>{it.category}</td>
                      <td className={styles.cell}>{it.sourceId}</td>
                      <td className={styles.cell}>
                        {it.trust ?? "—"}
                        {(it.sourcesCount ?? 0) >= 2 && (
                          <span className={styles.badgeSources}>
                            En {it.sourcesCount} fuentes
                          </span>
                        )}
                      </td>
                      <td className={styles.cell}>{it.status ?? "—"}</td>
                      <td className={styles.cell}>
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            Ver original
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

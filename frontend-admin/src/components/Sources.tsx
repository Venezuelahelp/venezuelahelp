import { useState } from "react";
import type { Source } from "@/types";
import styles from "./Sources.module.css";

interface CreateBody {
  nombre: string;
  url: string;
  extractHint?: string;
}

interface SourcesProps {
  sources: Source[];
  onToggle: (id: string, enabled: boolean) => void;
  onScrape: () => void;
  scraping: boolean;
  onCreate?: (body: CreateBody) => Promise<void> | void;
  onDelete?: (id: string) => void;
  creating?: boolean;
}

export function Sources({
  sources,
  onToggle,
  onScrape,
  scraping,
  onCreate,
  onDelete,
  creating = false,
}: SourcesProps) {
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [extractHint, setExtractHint] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!onCreate) return;
    const result = onCreate({
      nombre,
      url,
      extractHint: extractHint || undefined,
    });
    Promise.resolve(result)
      .then(() => {
        setNombre("");
        setUrl("");
        setExtractHint("");
      })
      .catch(() => {
        /* keep inputs so the user can retry */
      });
  }

  function handleDelete(src: Source) {
    if (!onDelete) return;
    if (window.confirm(`¿Eliminar la fuente "${src.nombre}"?`)) {
      onDelete(src.id);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Fuentes</h2>
        <button
          type="button"
          onClick={onScrape}
          disabled={scraping}
          aria-busy={scraping}
          className={styles.scrapeButton}
        >
          {scraping ? "Scraping…" : "Scrape ahora"}
        </button>
      </div>

      {/* ── Add source form ─────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className={styles.addForm} noValidate>
        <h3 className={styles.formHeading}>Agregar fuente</h3>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="nueva-nombre" className={styles.fieldLabel}>
              Nombre
            </label>
            <input
              id="nueva-nombre"
              type="text"
              className={styles.fieldInput}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="El Nacional"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="nueva-url" className={styles.fieldLabel}>
              URL
            </label>
            <input
              id="nueva-url"
              type="url"
              className={styles.fieldInput}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://ejemplo.com/feed"
              required
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="nueva-hint" className={styles.fieldLabel}>
            Qué buscar (opcional)
          </label>
          <input
            id="nueva-hint"
            type="text"
            className={styles.fieldInput}
            value={extractHint}
            onChange={(e) => setExtractHint(e.target.value)}
            placeholder="noticias sobre terremoto Caracas"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !nombre || !url}
          aria-busy={creating}
          className={styles.addButton}
        >
          {creating ? "Agregando…" : "Agregar fuente"}
        </button>
      </form>

      {/* ── Source list ────────────────────────────────────────────────── */}
      <ul className={styles.sourceList} role="list">
        {sources.map((src) => (
          <li key={src.id} className={styles.sourceRow}>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                className={styles.toggle}
                checked={src.enabled}
                onChange={() => onToggle(src.id, !src.enabled)}
              />
              <span className={styles.sourceName}>{src.nombre}</span>
            </label>
            {src.connector === "ai" && (
              <span className={styles.iaBadge} aria-label="Conector IA">
                IA
              </span>
            )}
            <span className={styles.url}>{src.url}</span>
            {onDelete && (
              <button
                type="button"
                onClick={() => handleDelete(src)}
                className={styles.deleteButton}
                aria-label={`Eliminar ${src.nombre}`}
              >
                Eliminar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

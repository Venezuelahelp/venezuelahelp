import { useState } from "react";
import type { Source, RestConfig, RestEndpoint, ProbeResult } from "@/types";
import { CATEGORIES } from "@/categories";
import styles from "./Sources.module.css";

interface CreateBody {
  nombre: string;
  url: string;
  extractHint?: string;
}

interface CreateRestBody {
  nombre: string;
  url: string;
  rest: RestConfig;
}

interface SourcesProps {
  sources: Source[];
  onToggle: (id: string, enabled: boolean) => void;
  onScrape: () => void;
  scraping: boolean;
  onCreate?: (body: CreateBody) => Promise<void> | void;
  onCreateRest?: (body: CreateRestBody) => Promise<void> | void;
  onProbe?: (rest: RestConfig) => Promise<ProbeResult>;
  onDelete?: (id: string) => void;
  creating?: boolean;
}

type Tipo = "ai" | "rest";

// Estado de edición de un endpoint en el form (campos planos, se serializan a
// RestEndpoint al probar/guardar). `texto` es una lista separada por comas.
interface EndpointForm {
  label: string;
  url: string;
  category: string;
  itemsPath: string;
  shape: "array" | "geojson";
  externalId: string;
  titulo: string;
  texto: string;
  lat: string;
  lng: string;
  imageUrl: string;
  sourceUrl: string;
}

function emptyEndpoint(): EndpointForm {
  return {
    label: "",
    url: "",
    category: CATEGORIES[0].key,
    itemsPath: "",
    shape: "array",
    externalId: "id",
    titulo: "",
    texto: "",
    lat: "",
    lng: "",
    imageUrl: "",
    sourceUrl: "",
  };
}

function toRestEndpoint(e: EndpointForm): RestEndpoint {
  const fieldMap: RestEndpoint["fieldMap"] = {
    externalId: e.externalId.trim(),
    titulo: e.titulo.trim(),
  };
  const texto = e.texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (texto.length) fieldMap.texto = texto;
  if (e.lat.trim()) fieldMap.lat = e.lat.trim();
  if (e.lng.trim()) fieldMap.lng = e.lng.trim();
  if (e.imageUrl.trim()) fieldMap.imageUrl = e.imageUrl.trim();
  if (e.sourceUrl.trim()) fieldMap.sourceUrl = e.sourceUrl.trim();
  const ep: RestEndpoint = {
    label: e.label.trim(),
    url: e.url.trim(),
    category: e.category,
    shape: e.shape,
    fieldMap,
  };
  if (e.itemsPath.trim()) ep.itemsPath = e.itemsPath.trim();
  return ep;
}

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  error: "Error",
  blocked: "Bloqueada",
};

function StatusBadge({ src }: { src: Source }) {
  // "ok con 0 ítems" se marca como advertencia (posible fuente rota en silencio).
  const status = src.status ?? src.lastStatus;
  const zeroItems = src.status === "ok" && src.lastFetched === 0;
  const kind = zeroItems ? "warn" : (status ?? "unknown");
  const label = zeroItems
    ? "OK · 0 ítems"
    : (STATUS_LABEL[status ?? ""] ?? "—");
  const count =
    typeof src.lastFetched === "number" ? ` (${src.lastFetched})` : "";
  return (
    <span
      className={styles.statusBadge}
      data-kind={kind}
      title={src.endpointStats
        ?.map((s) => `${s.label}: ${s.error ?? s.fetched}`)
        .join(" · ")}
    >
      {label}
      {!zeroItems && count}
    </span>
  );
}

export function Sources({
  sources,
  onToggle,
  onScrape,
  scraping,
  onCreate,
  onCreateRest,
  onProbe,
  onDelete,
  creating = false,
}: SourcesProps) {
  const [tipo, setTipo] = useState<Tipo>("ai");
  const [nombre, setNombre] = useState("");
  const [url, setUrl] = useState("");
  const [extractHint, setExtractHint] = useState("");

  // Estado del editor rest.
  const [base, setBase] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointForm[]>([emptyEndpoint()]);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  function buildRest(): RestConfig {
    return { base: base.trim(), endpoints: endpoints.map(toRestEndpoint) };
  }

  function setEndpoint(i: number, patch: Partial<EndpointForm>) {
    setEndpoints((prev) =>
      prev.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    );
  }

  function resetForm() {
    setNombre("");
    setUrl("");
    setExtractHint("");
    setBase("");
    setEndpoints([emptyEndpoint()]);
    setProbe(null);
    setProbeError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tipo === "ai") {
      if (!onCreate) return;
      Promise.resolve(
        onCreate({ nombre, url, extractHint: extractHint || undefined }),
      )
        .then(resetForm)
        .catch(() => {});
      return;
    }
    if (!onCreateRest) return;
    Promise.resolve(onCreateRest({ nombre, url, rest: buildRest() }))
      .then(resetForm)
      .catch(() => {});
  }

  async function handleProbe() {
    if (!onProbe) return;
    setProbing(true);
    setProbeError(null);
    setProbe(null);
    try {
      setProbe(await onProbe(buildRest()));
    } catch {
      setProbeError("No se pudo probar. Revisá la base y las URLs.");
    } finally {
      setProbing(false);
    }
  }

  function handleDelete(src: Source) {
    if (!onDelete) return;
    if (window.confirm(`¿Eliminar la fuente "${src.nombre}"?`)) {
      onDelete(src.id);
    }
  }

  const canSubmit =
    tipo === "ai"
      ? Boolean(nombre && url)
      : Boolean(
          nombre &&
          url &&
          base &&
          endpoints.every((e) => e.label && e.url && e.titulo),
        );

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

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Tipo</span>
          <div
            className={styles.tipoRow}
            role="radiogroup"
            aria-label="Tipo de fuente"
          >
            <label className={styles.tipoOption}>
              <input
                type="radio"
                name="tipo"
                checked={tipo === "ai"}
                onChange={() => setTipo("ai")}
              />
              IA (pegar una dirección)
            </label>
            <label className={styles.tipoOption}>
              <input
                type="radio"
                name="tipo"
                checked={tipo === "rest"}
                onChange={() => setTipo("rest")}
              />
              API JSON (mapeo de campos)
            </label>
          </div>
        </div>

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
              {tipo === "rest" ? "URL pública (home de la fuente)" : "URL"}
            </label>
            <input
              id="nueva-url"
              type="url"
              className={styles.fieldInput}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://ejemplo.com"
              required
            />
          </div>
        </div>

        {tipo === "ai" && (
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
        )}

        {tipo === "rest" && (
          <div className={styles.restEditor}>
            <div className={styles.field}>
              <label htmlFor="rest-base" className={styles.fieldLabel}>
                Base de la API (para resolver imágenes/links relativos)
              </label>
              <input
                id="rest-base"
                type="url"
                className={styles.fieldInput}
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="https://api.ejemplo.com"
              />
            </div>

            {endpoints.map((ep, i) => (
              <fieldset key={i} className={styles.endpointCard}>
                <legend className={styles.endpointLegend}>
                  Endpoint {i + 1}
                  {endpoints.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeEndpoint}
                      onClick={() =>
                        setEndpoints((prev) => prev.filter((_, j) => j !== i))
                      }
                      aria-label={`Quitar endpoint ${i + 1}`}
                    >
                      Quitar
                    </button>
                  )}
                </legend>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Etiqueta</label>
                    <input
                      className={styles.fieldInput}
                      aria-label="Etiqueta"
                      value={ep.label}
                      onChange={(e) =>
                        setEndpoint(i, { label: e.target.value })
                      }
                      placeholder="reportes"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Categoría</label>
                    <select
                      className={styles.fieldInput}
                      value={ep.category}
                      onChange={(e) =>
                        setEndpoint(i, { category: e.target.value })
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>URL del endpoint</label>
                  <input
                    className={styles.fieldInput}
                    type="url"
                    aria-label="URL del endpoint"
                    value={ep.url}
                    onChange={(e) => setEndpoint(i, { url: e.target.value })}
                    placeholder="https://api.ejemplo.com/api/reports"
                  />
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      itemsPath (dot-path al array)
                    </label>
                    <input
                      className={styles.fieldInput}
                      value={ep.itemsPath}
                      onChange={(e) =>
                        setEndpoint(i, { itemsPath: e.target.value })
                      }
                      placeholder="data (vacío = raíz array)"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Forma</label>
                    <select
                      className={styles.fieldInput}
                      value={ep.shape}
                      onChange={(e) =>
                        setEndpoint(i, {
                          shape: e.target.value as "array" | "geojson",
                        })
                      }
                    >
                      <option value="array">array</option>
                      <option value="geojson">geojson</option>
                    </select>
                  </div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>externalId</label>
                    <input
                      className={styles.fieldInput}
                      value={ep.externalId}
                      onChange={(e) =>
                        setEndpoint(i, { externalId: e.target.value })
                      }
                      placeholder="id"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>titulo</label>
                    <input
                      className={styles.fieldInput}
                      aria-label="titulo"
                      value={ep.titulo}
                      onChange={(e) =>
                        setEndpoint(i, { titulo: e.target.value })
                      }
                      placeholder="place"
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>
                    texto (dot-paths separados por coma)
                  </label>
                  <input
                    className={styles.fieldInput}
                    value={ep.texto}
                    onChange={(e) => setEndpoint(i, { texto: e.target.value })}
                    placeholder="description, items_needed"
                  />
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>lat</label>
                    <input
                      className={styles.fieldInput}
                      value={ep.lat}
                      onChange={(e) => setEndpoint(i, { lat: e.target.value })}
                      placeholder="lat"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>lng</label>
                    <input
                      className={styles.fieldInput}
                      value={ep.lng}
                      onChange={(e) => setEndpoint(i, { lng: e.target.value })}
                      placeholder="lng"
                    />
                  </div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>imageUrl</label>
                    <input
                      className={styles.fieldInput}
                      value={ep.imageUrl}
                      onChange={(e) =>
                        setEndpoint(i, { imageUrl: e.target.value })
                      }
                      placeholder="photo_url / media_urls.0"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      sourceUrl (permalink)
                    </label>
                    <input
                      className={styles.fieldInput}
                      value={ep.sourceUrl}
                      onChange={(e) =>
                        setEndpoint(i, { sourceUrl: e.target.value })
                      }
                      placeholder="source_url"
                    />
                  </div>
                </div>
              </fieldset>
            ))}

            <div className={styles.restActions}>
              <button
                type="button"
                className={styles.addEndpoint}
                onClick={() =>
                  setEndpoints((prev) => [...prev, emptyEndpoint()])
                }
              >
                + Endpoint
              </button>
              <button
                type="button"
                className={styles.probeButton}
                onClick={() => void handleProbe()}
                disabled={probing || !base}
                aria-busy={probing}
              >
                {probing ? "Probando…" : "Probar"}
              </button>
            </div>

            {probeError && <p className={styles.probeError}>{probeError}</p>}

            {probe && (
              <div className={styles.probeResult}>
                <ul className={styles.probeStats}>
                  {probe.endpointStats.map((s) => (
                    <li key={s.label} data-error={Boolean(s.error)}>
                      {s.label}:{" "}
                      {s.error ? `✗ ${s.error}` : `✓ ${s.fetched} ítems`}
                    </li>
                  ))}
                </ul>
                {probe.sample.length > 0 && (
                  <ul className={styles.probeSample}>
                    {probe.sample.slice(0, 5).map((it, k) => (
                      <li key={k}>
                        <strong>{it.titulo}</strong>
                        {it.texto ? ` — ${it.texto.slice(0, 80)}` : ""}
                        {it.sourceUrl ? " 🔗" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={creating || !canSubmit}
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
            {src.connector === "rest" && (
              <span className={styles.iaBadge} aria-label="Conector API JSON">
                API
              </span>
            )}
            <StatusBadge src={src} />
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

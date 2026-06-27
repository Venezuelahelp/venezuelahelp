import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  MagnifyingGlass,
  Translate,
  MapPin,
  Phone,
  EnvelopeSimple,
  WhatsappLogo,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import {
  useInterpreters,
  EMPTY_FILTERS,
  LANGUAGES,
  SUPPORT_TYPES,
  FLUENCY,
  PAGE_SIZE,
  SOURCE_URL,
  type Interpreter,
  type InterpreterFilters,
} from "@/data/interpreters";
import Pagination from "@/components/Pagination";
import styles from "./Interpreters.module.css";

function digits(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

function Contact({ it }: { it: Interpreter }) {
  const [open, setOpen] = useState(false);
  const channels = it.contact_channels ?? [];
  const wa = it.phone && channels.includes("WhatsApp") ? digits(it.phone) : "";

  if (!it.phone && !it.email) {
    return <span className={styles.noContact}>Sin contacto público</span>;
  }
  if (!open) {
    return (
      <button
        type="button"
        className={styles.reveal}
        onClick={() => setOpen(true)}
      >
        Mostrar contacto
      </button>
    );
  }
  return (
    <div className={styles.contactRow}>
      {wa && (
        <a
          className={styles.contactBtn}
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsappLogo size={15} weight="fill" aria-hidden="true" />
          WhatsApp
        </a>
      )}
      {it.phone && (
        <a className={styles.contactBtn} href={`tel:${digits(it.phone)}`}>
          <Phone size={15} weight="fill" aria-hidden="true" />
          {it.phone}
        </a>
      )}
      {it.email && (
        <a className={styles.contactBtn} href={`mailto:${it.email}`}>
          <EnvelopeSimple size={15} weight="bold" aria-hidden="true" />
          {it.email}
        </a>
      )}
    </div>
  );
}

function Card({ it }: { it: Interpreter }) {
  const langs = it.languages ?? [];
  const lugar = it.in_venezuela
    ? [it.city, it.state].filter(Boolean).join(", ") || "En Venezuela"
    : "Fuera de Venezuela";

  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.name}>{it.full_name || "Intérprete"}</span>
        {it.fluency && <span className={styles.fluency}>{it.fluency}</span>}
      </div>

      <div className={styles.langs}>
        <Translate size={15} weight="bold" aria-hidden="true" />
        {langs.length ? (
          langs.map((l) => (
            <span key={l} className={styles.lang}>
              {l}
            </span>
          ))
        ) : (
          <span className={styles.muted}>Idioma no indicado</span>
        )}
      </div>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <MapPin size={14} weight="fill" aria-hidden="true" />
          {lugar}
        </span>
        {(it.support_types ?? []).map((s) => (
          <span key={s} className={styles.tag}>
            {s}
          </span>
        ))}
      </div>

      {(it.availability ?? []).length > 0 && (
        <p className={styles.avail}>
          Disponible: {(it.availability ?? []).join(" · ")}
        </p>
      )}

      <Contact it={it} />
    </li>
  );
}

export default function Interpreters() {
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<InterpreterFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  // Debounce del buscador (350ms) para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, q: draft }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [draft]);

  const { rows, total, loading, error } = useInterpreters(filters, page);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  function setFilter<K extends keyof InterpreterFilters>(
    key: K,
    value: InterpreterFilters[K],
  ) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  return (
    <div className={styles.page}>
      <a href="#/" className={styles.back}>
        <ArrowLeft aria-hidden="true" size={16} weight="bold" />
        Volver al inicio
      </a>

      <h1 className={styles.title}>Intérpretes voluntarios</h1>
      <p className={styles.lead}>
        Personas que ofrecen traducción —remota o en el terreno— para apoyar a
        las brigadas de rescate. La información se consulta en vivo desde{" "}
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.sourceLink}
        >
          interp-aid <ArrowSquareOut size={13} weight="bold" aria-hidden="true" />
        </a>
        .
      </p>

      <div className={styles.search}>
        <MagnifyingGlass
          className={styles.searchIcon}
          size={18}
          aria-hidden="true"
        />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar por nombre o ciudad…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Buscar intérpretes"
        />
      </div>

      <div className={styles.filters}>
        <select
          className={styles.select}
          value={filters.language}
          onChange={(e) => setFilter("language", e.target.value)}
          aria-label="Idioma"
        >
          <option value="">Todos los idiomas</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={filters.supportType}
          onChange={(e) => setFilter("supportType", e.target.value)}
          aria-label="Tipo de apoyo"
        >
          <option value="">Remota o presencial</option>
          {SUPPORT_TYPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className={styles.select}
          value={filters.fluency}
          onChange={(e) => setFilter("fluency", e.target.value)}
          aria-label="Nivel"
        >
          <option value="">Cualquier nivel</option>
          {FLUENCY.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={filters.inVenezuela}
            onChange={(e) => setFilter("inVenezuela", e.target.checked)}
          />
          Solo en Venezuela
        </label>
      </div>

      <p className={styles.count} aria-live="polite">
        {loading ? "Buscando…" : `${total.toLocaleString("es")} intérpretes`}
      </p>

      {error ? (
        <p className={styles.state}>
          No pudimos cargar los intérpretes.{" "}
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setFilters((f) => ({ ...f }))}
          >
            Reintentar
          </button>
        </p>
      ) : !loading && rows.length === 0 ? (
        <p className={styles.state}>No hay intérpretes para esta búsqueda.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((it) => (
            <Card key={it.id} it={it} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          label="Paginación de intérpretes"
        />
      )}
    </div>
  );
}

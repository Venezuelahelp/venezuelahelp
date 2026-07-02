import { Fragment, useCallback, useEffect, useState } from "react";
import type { QaLogEntry, TgUser } from "@/types";
import styles from "./QaLogDrawer.module.css";

interface QaLogDrawerProps {
  user: TgUser;
  loadQa: (chatId: number) => Promise<QaLogEntry[]>;
  onClose: () => void;
}

const TRUNCATE_AT = 180;

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function QaLogDrawer({ user, loadQa, onClose }: QaLogDrawerProps) {
  const [logs, setLogs] = useState<QaLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await loadQa(user.chatId));
    } catch {
      setError("No se pudieron cargar las interacciones.");
    } finally {
      setLoading(false);
    }
  }, [loadQa, user.chatId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Escape cierra el drawer, igual que el click en el backdrop.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Fragment>
      <div
        className={styles.backdrop}
        onClick={onClose}
        data-testid="qa-log-backdrop"
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-label={`Q&A de ${user.nombre || user.chatId}`}
      >
        <div className={styles.head}>
          <div className={styles.headText}>
            <h3 className={styles.title}>
              Q&A · {user.nombre || `chat ${user.chatId}`}
            </h3>
            {user.username && (
              <span className={styles.subtitle}>@{user.username}</span>
            )}
          </div>
          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void refresh()}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!error && logs === null && (
          <p className={styles.empty} role="status">
            Cargando interacciones…
          </p>
        )}
        {!error && logs !== null && logs.length === 0 && (
          <p className={styles.empty}>
            Este usuario aún no tiene interacciones.
          </p>
        )}

        {logs !== null && logs.length > 0 && (
          // Lista acotada + scroll propio (convención de listas del proyecto).
          <ul className={styles.list} role="list">
            {logs.map((l) => {
              const isOpen = expanded === l.ts;
              const truncated = l.respuesta.length > TRUNCATE_AT && !isOpen;
              const respuesta = truncated
                ? `${l.respuesta.slice(0, TRUNCATE_AT)}…`
                : l.respuesta;
              return (
                <li key={l.ts} className={styles.entry}>
                  <div className={styles.entryHead}>
                    <span className={styles.when}>{formatTs(l.ts)}</span>
                    {l.intent && (
                      <span className={styles.intent}>{l.intent}</span>
                    )}
                    {l.flagged && (
                      <span className={styles.flagged}>⚑ flag</span>
                    )}
                  </div>
                  <p className={styles.pregunta}>{l.pregunta}</p>
                  <p className={styles.respuesta}>{respuesta}</p>
                  {l.respuesta.length > TRUNCATE_AT && (
                    <button
                      type="button"
                      className={styles.expandButton}
                      onClick={() => setExpanded(isOpen ? null : l.ts)}
                    >
                      {isOpen ? "Ver menos" : "Ver más"}
                    </button>
                  )}
                  <div className={styles.meta}>
                    <span>{l.modelo}</span>
                    <span>
                      {l.tokensIn}→{l.tokensOut} tokens
                    </span>
                    <span>${l.costoEstimado.toFixed(5)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </Fragment>
  );
}

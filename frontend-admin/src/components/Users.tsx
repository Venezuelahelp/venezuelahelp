import type { TgUser } from "@/types";
import styles from "./Users.module.css";

interface UsersProps {
  users: TgUser[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function Users({ users, onRefresh, refreshing }: UsersProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Usuarios de Telegram</h2>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
            className={styles.refreshButton}
          >
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        )}
      </div>

      {users.length === 0 ? (
        <p className={styles.empty}>Aún no hay usuarios registrados.</p>
      ) : (
        <ul className={styles.list} role="list">
          <li className={`${styles.row} ${styles.headRow}`} aria-hidden="true">
            <span>Usuario</span>
            <span>Idioma</span>
            <span>Primera vez</span>
            <span>Última vez</span>
            <span className={styles.num}>Msgs</span>
          </li>
          {users.map((u) => (
            <li key={u.chatId} className={styles.row}>
              <span className={styles.name}>
                {u.nombre || "—"}
                {u.username && (
                  <span className={styles.username}>@{u.username}</span>
                )}
              </span>
              <span className={styles.cell}>{u.languageCode ?? "—"}</span>
              <span className={styles.cell}>{formatTs(u.firstSeenAt)}</span>
              <span className={styles.cell}>{formatTs(u.lastSeenAt)}</span>
              <span className={styles.num}>{u.msgCount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

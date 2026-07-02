import { useState } from "react";
import type { QaLogEntry, TgUser } from "@/types";
import { QaLogDrawer } from "@/components/QaLogDrawer";
import styles from "./Users.module.css";

interface UsersProps {
  users: TgUser[];
  onRefresh?: () => void;
  refreshing?: boolean;
  // Bloquear/desbloquear un usuario (lista negra del bot). busyChatId marca la
  // fila en curso para deshabilitar su botón mientras se procesa.
  onToggleBlock?: (user: TgUser) => void;
  busyChatId?: number;
  // Visor de Q&A: si está presente, click en una fila abre el drawer con las
  // últimas interacciones de ese chat.
  onLoadQa?: (chatId: number) => Promise<QaLogEntry[]>;
}

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

// "es" → "Español". Capitaliza la primera letra (Intl devuelve minúscula).
function languageName(code?: string): string {
  if (!code) return "—";
  try {
    const dn = new Intl.DisplayNames(["es"], { type: "language" });
    const name = dn.of(code) ?? code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code;
  }
}

export function Users({
  users,
  onRefresh,
  refreshing,
  onToggleBlock,
  busyChatId,
  onLoadQa,
}: UsersProps) {
  const [selected, setSelected] = useState<TgUser | null>(null);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headLeft}>
          <h2 className={styles.heading}>Usuarios de Telegram</h2>
          {users.length > 0 && (
            <span className={styles.count}>{users.length}</span>
          )}
        </div>
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
        // Altura acotada + scroll propio: la lista no alarga la página.
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Idioma</th>
                <th scope="col">Primera vez</th>
                <th scope="col">Última vez</th>
                <th scope="col" className={styles.numCol}>
                  Msgs
                </th>
                <th scope="col">Estado</th>
                {onToggleBlock && <th scope="col" aria-label="Acción" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.chatId}
                  onClick={onLoadQa ? () => setSelected(u) : undefined}
                  className={onLoadQa ? styles.rowClickable : undefined}
                >
                  <td>
                    <div className={styles.name}>{u.nombre || "—"}</div>
                    {u.username && (
                      <div className={styles.username}>@{u.username}</div>
                    )}
                  </td>
                  <td className={styles.cell}>
                    {languageName(u.languageCode)}
                  </td>
                  <td className={styles.cellWhen}>{formatTs(u.firstSeenAt)}</td>
                  <td className={styles.cellWhen}>{formatTs(u.lastSeenAt)}</td>
                  <td className={styles.num}>{u.msgCount}</td>
                  <td className={styles.cell}>
                    {u.blocked ? (
                      <span className={styles.badgeBlocked}>🚫 Bloqueado</span>
                    ) : u.strikes && u.strikes > 0 ? (
                      <span className={styles.badgeWarn}>
                        ⚠️ {u.strikes} strike{u.strikes === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className={styles.badgeOk}>Activo</span>
                    )}
                  </td>
                  {onToggleBlock && (
                    <td className={styles.cell}>
                      <button
                        type="button"
                        className={styles.blockButton}
                        disabled={busyChatId === u.chatId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBlock(u);
                        }}
                      >
                        {busyChatId === u.chatId
                          ? "…"
                          : u.blocked
                            ? "Desbloquear"
                            : "Bloquear"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && onLoadQa && (
        <QaLogDrawer
          user={selected}
          loadQa={onLoadQa}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

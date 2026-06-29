import { useState } from "react";
import type { ApiAccessRequest, ApiKey, ApproveResult } from "@/types";
import styles from "./ApiRequests.module.css";

interface ApiRequestsProps {
  requests: ApiAccessRequest[];
  keys: ApiKey[];
  onApprove: (id: string) => Promise<ApproveResult>;
  onReject: (id: string) => void;
  onRevoke: (id: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
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

const STATUS_LABEL: Record<ApiAccessRequest["status"], string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export function ApiRequests({
  requests,
  keys,
  onApprove,
  onReject,
  onRevoke,
  onRefresh,
  refreshing,
}: ApiRequestsProps) {
  // La key en claro recién emitida: se muestra UNA vez y luego se descarta.
  const [issued, setIssued] = useState<ApproveResult | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const result = await onApprove(id);
      setIssued(result);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Solicitudes de API</h2>
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

      {issued && (
        <div className={styles.keyBanner} role="alert">
          <p className={styles.keyBannerTitle}>
            Clave emitida para {issued.apiKey.consumerName}
          </p>
          <code className={styles.rawKey}>{issued.rawKey}</code>
          <p className={styles.keyBannerHint}>
            Cópiala y envíasela a <strong>{issued.apiKey.email}</strong>. Se
            muestra <strong>una sola vez</strong>; no se vuelve a poder ver.
          </p>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setIssued(null)}
          >
            Entendido, ya la copié
          </button>
        </div>
      )}

      {requests.length === 0 ? (
        <p className={styles.empty}>No hay solicitudes.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Solicitante</th>
                <th scope="col">Uso</th>
                <th scope="col">Fecha</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className={styles.name}>{r.nombre}</div>
                    <div className={styles.email}>{r.email}</div>
                    {r.organizacion && (
                      <div className={styles.org}>{r.organizacion}</div>
                    )}
                  </td>
                  <td className={styles.motivo}>{r.motivo}</td>
                  <td className={styles.when}>{formatTs(r.createdAt)}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td>
                    {r.status === "pendiente" ? (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.approve}
                          disabled={busyId === r.id}
                          onClick={() => void handleApprove(r.id)}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          className={styles.reject}
                          onClick={() => onReject(r.id)}
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className={styles.heading}>Claves emitidas</h2>
      {keys.length === 0 ? (
        <p className={styles.empty}>Aún no hay claves emitidas.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Key ID</th>
                <th scope="col">Consumidor</th>
                <th scope="col">Estado</th>
                <th scope="col">Creada</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.keyId}>
                  <td className={styles.mono}>{k.keyId}</td>
                  <td>
                    <div className={styles.name}>{k.consumerName}</div>
                    <div className={styles.email}>{k.email}</div>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        k.status === "active" ? styles.aprobada : styles.rechazada
                      }`}
                    >
                      {k.status === "active" ? "Activa" : "Revocada"}
                    </span>
                  </td>
                  <td className={styles.when}>{formatTs(k.createdAt)}</td>
                  <td>
                    {k.status === "active" ? (
                      <button
                        type="button"
                        className={styles.reject}
                        onClick={() => onRevoke(k.keyId)}
                      >
                        Revocar
                      </button>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

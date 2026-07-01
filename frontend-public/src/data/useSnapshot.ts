import { useEffect, useState } from "react";
import type { Snapshot } from "@/types";

const URL = import.meta.env.VITE_SNAPSHOT_URL ?? "/snapshot.json";
// El snapshot se regenera con cada scrape; refrescamos en segundo plano cada
// minuto para que la página muestre datos frescos sin que el usuario recargue.
const REFRESH_MS = 60_000;

export function useSnapshot() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load(initial: boolean) {
      try {
        // `no-cache`: revalidar con el servidor (If-None-Match/ETag) antes de
        // usar la copia cacheada. Barato (un 304 cuando no cambió) y evita que
        // un dispositivo se quede pegado a un snapshot viejo — p.ej. el móvil
        // que mostraba "Match 0" al servir un snapshot previo a ese campo.
        const r = await fetch(URL, { cache: "no-cache" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        // CloudFront rewrites a 403 on the data path to index.html (HTTP 200);
        // reject an HTML body so it surfaces as a clear error, not a confusing
        // JSON parse failure on masked auth errors.
        const ct = r.headers.get("content-type") ?? "";
        if (!ct.includes("json")) {
          throw new Error(`Respuesta inesperada (${ct || "sin content-type"})`);
        }
        const d = (await r.json()) as Snapshot;
        if (!alive) return;
        setData(d);
        setError(null);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        // En los refrescos automáticos mantenemos los últimos datos buenos en
        // pantalla; solo la carga inicial expone el error (la página aún vacía).
        if (initial) {
          setError(e instanceof Error ? e.message : "error");
          setLoading(false);
        }
      }
    }

    void load(true);
    const id = setInterval(() => void load(false), REFRESH_MS);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { data, loading, error };
}

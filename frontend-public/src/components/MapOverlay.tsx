import { lazy, Suspense, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import CategoryFilter from "@/components/CategoryFilter";
import type { Category, Item } from "@/types";
import styles from "./MapOverlay.module.css";

const MapView = lazy(() => import("@/components/MapView"));

interface Props {
  items: Item[];
  active: Set<Category>;
  onToggle: (c: Category) => void;
  counts: Record<Category, number>;
  onClose: () => void;
}

// Mapa a pantalla completa (móvil): se abre desde el botón flotante "Mapa".
// Trae los filtros de categoría en una fila compacta arriba y un botón de
// cerrar. Bloquea el scroll del fondo y cierra con Escape.
export default function MapOverlay({
  items,
  active,
  onToggle,
  counts,
  onClose,
}: Props) {
  const located = items.filter((i) => i.ubicacion != null).length;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Mapa de ubicaciones"
    >
      <div className={styles.bar}>
        <span className={styles.title}>
          Mapa · {located.toLocaleString("es")} ubicaciones
        </span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Cerrar mapa"
        >
          <X size={18} weight="bold" aria-hidden="true" />
          Cerrar
        </button>
      </div>

      <div className={styles.filters}>
        <CategoryFilter
          active={active}
          onToggle={onToggle}
          counts={counts}
          compact
        />
      </div>

      <div className={styles.map}>
        <Suspense
          fallback={<div className={styles.loading}>Cargando mapa…</div>}
        >
          <MapView items={items} scrollWheelZoom />
        </Suspense>
      </div>
    </div>
  );
}

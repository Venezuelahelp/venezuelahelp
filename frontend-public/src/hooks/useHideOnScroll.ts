import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Devuelve `true` cuando la barra debe ocultarse. La oculta al hacer scroll
 * hacia abajo **solo si la barra ya está pegada (pinned) al header**; al subir
 * la vuelve a mostrar.
 *
 * El gate de "pinned" es clave: la barra es `position: sticky`, así que mientras
 * está en su posición natural (aún no pegada) su espacio sigue reservado en el
 * flujo — ocultarla ahí dejaría un hueco blanco. Solo cuando está pegada al
 * header su hueco queda fuera de pantalla y deslizarla no rompe el layout.
 *
 * @param ref          el elemento sticky (la barra de controles)
 * @param enabled      si es `false`, nunca oculta (p.ej. en desktop)
 * @param headerOffset px a los que la barra queda pegada (alto del header)
 * @param delta        umbral anti-parpadeo ante micro-scroll
 */
export function useHideOnScroll(
  ref: RefObject<HTMLElement>,
  enabled = true,
  headerOffset = 80,
  delta = 8,
): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Desactivado (desktop): asegura que la barra quede visible y no escucha scroll.
    if (!enabled) {
      setHidden(false);
      return;
    }
    lastY.current = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const diff = y - lastY.current;
      lastY.current = y;

      if (Math.abs(diff) < delta) return;

      if (diff > 0) {
        // Bajando: ocultar solo si la barra ya tocó el header (pinned).
        const top = ref.current?.getBoundingClientRect().top ?? Infinity;
        if (top <= headerOffset + 1) setHidden(true);
      } else {
        // Subiendo: mostrar siempre.
        setHidden(false);
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref, enabled, headerOffset, delta]);

  return hidden;
}

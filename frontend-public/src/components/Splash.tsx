import { useEffect, useRef, useState } from "react";
import styles from "./Splash.module.css";

interface Props {
  onDone: () => void;
}

const HOLD_MS = 3000; // logo en grande sobre fondo blanco
const MORPH_MS = 850; // duración de la transición al header

// Intro: muestra el logo en grande 3s y luego, con una animación FLIP, lo lleva
// a la posición y tamaño exactos del logo del header (lo mide en vivo) mientras
// el fondo blanco se desvanece. Al aterrizar coincide con el logo real del
// header, así el desmontaje no produce salto. La página queda en el tope.
export default function Splash({ onDone }: Props) {
  const logoRef = useRef<HTMLImageElement>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // sin scroll durante el intro

    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const t1 = window.setTimeout(() => {
      const splash = logoRef.current;
      const headerLogo =
        document.querySelector<HTMLImageElement>("header img");
      if (splash && headerLogo && !reduce) {
        const s = splash.getBoundingClientRect();
        const h = headerLogo.getBoundingClientRect();
        const dx = h.left + h.width / 2 - (s.left + s.width / 2);
        const dy = h.top + h.height / 2 - (s.top + s.height / 2);
        const scale = h.width / s.width;
        splash.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      }
      setLeaving(true);
    }, HOLD_MS);

    const t2 = window.setTimeout(
      onDone,
      HOLD_MS + (reduce ? 300 : MORPH_MS),
    );

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.body.style.overflow = prevOverflow;
    };
  }, [onDone]);

  return (
    <div
      className={`${styles.overlay} ${leaving ? styles.leaving : ""}`}
      aria-hidden="true"
    >
      <img
        ref={logoRef}
        src="/logo.png"
        alt=""
        className={styles.logo}
        decoding="async"
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Item } from "@/types";
import ItemList from "@/components/ItemList";
import styles from "./InfiniteList.module.css";

const PAGE = 20;

/**
 * Lista con scroll infinito: muestra los primeros `PAGE` ítems y va cargando
 * más al acercarse al final (IntersectionObserver). Se reinicia montándola con
 * una `key` por filtro (App), así un cambio de filtro vuelve a empezar arriba.
 */
export default function InfiniteList({ items }: { items: Item[] }) {
  const [count, setCount] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCount((c) => Math.min(c + PAGE, items.length));
        }
      },
      // Precarga: dispara ~1 pantalla antes de llegar al final.
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  const shown = items.slice(0, count);
  const remaining = items.length - shown.length;

  return (
    <section aria-label="Lista de elementos">
      <ItemList items={shown} />
      {remaining > 0 && (
        <div ref={sentinel} className={styles.sentinel} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          Cargando más… ({remaining.toLocaleString("es")} restantes)
        </div>
      )}
    </section>
  );
}

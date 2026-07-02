import { useEffect, useState } from "react";

/**
 * Devuelve `value` con un retraso de `delayMs`. Evita recalcular el filtrado
 * sobre ~66k ítems canónicos en cada tecla de la búsqueda (spec E5).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

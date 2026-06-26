import { useEffect, useState } from "react";

/**
 * Reactive media-query hook. SSR/test-safe: if `window.matchMedia` is
 * unavailable, returns `fallback` (default desktop=true so content is never
 * hidden when the API is missing).
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

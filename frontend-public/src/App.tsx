import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useSnapshot } from "@/data/useSnapshot";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { sendBeacon } from "@/track";
import {
  flatten,
  filterItems,
  countByCategory,
  sourcesForDisplay,
} from "@/data/filter";
import { SourcesContext } from "@/data/sources";
import type { Category } from "@/types";

import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import ItemList from "@/components/ItemList";
import Pagination from "@/components/Pagination";
import ViewToggle, { type View } from "@/components/ViewToggle";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import AboutPage from "@/components/AboutPage";
import Splash from "@/components/Splash";
import { Loading, Empty, ErrorState } from "@/components/States";

import styles from "./App.module.css";

// Leaflet is heavy; code-split it so it only loads when the map view is opened.
const MapView = lazy(() => import("@/components/MapView"));

const PAGE_SIZE = 20;

export default function App() {
  const { data, loading, error } = useSnapshot();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Set<Category>>(new Set());
  const [view, setView] = useState<View>("lista");
  const [page, setPage] = useState(1);
  const [route, setRoute] = useState<string>(
    typeof window !== "undefined" ? window.location.hash : "",
  );
  const listTopRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const HEADER_H = 80;
  // El auto-ocultar de la barra solo en mobile (desktop tiene espacio de sobra).
  const isMobile = useMediaQuery("(max-width: 639px)", false);
  const controlsHidden = useHideOnScroll(controlsRef, isMobile, HEADER_H);
  const [showSplash, setShowSplash] = useState(true);

  // Fire the analytics beacon once per page load (never blocks render).
  useEffect(() => {
    sendBeacon();
  }, []);

  // Lightweight hash routing (no router dep): "#/quienes-somos" → About page.
  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Any change to the filters returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [query, active]);

  // Beacon de analítica: una vez por carga, al montar. Fire-and-forget.
  useEffect(() => {
    sendBeacon();
  }, []);

  function onToggle(cat: Category) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  function onClear() {
    setQuery("");
    setActive(new Set());
  }

  function onChangePage(p: number) {
    setPage(p);
    // Scroll the list top to sit just below the sticky header + controls bar.
    const el = listTopRef.current;
    if (!el) return;
    const stick = (controlsRef.current?.offsetHeight ?? 0) + HEADER_H;
    const top = window.scrollY + el.getBoundingClientRect().top - stick - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  const isAbout = route === "#/quienes-somos";

  return (
    <div className={styles.page}>
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      <Header />

      <main className={styles.main}>
        {isAbout ? (
          <AboutPage />
        ) : (
          <>
            {loading && <Loading />}

            {error && !loading && (
              <ErrorState onRetry={() => location.reload()} />
            )}

            {data &&
              !loading &&
              !error &&
              (() => {
                const items = flatten(data);
                const catCounts = countByCategory(items);
                const filtered = filterItems(items, query, active);
                const located = filtered.filter((it) => it.ubicacion != null);
                // Hero y Footer reflejan el directorio de fuentes del snapshot
                // (= fuentes configuradas en el admin), no los sourceIds de los
                // items, para no omitir fuentes sin datos ni colar ids huérfanos.
                const displaySources = sourcesForDisplay(
                  Object.keys(data.sources ?? {}),
                  items,
                );

                const totalPages = Math.max(
                  1,
                  Math.ceil(filtered.length / PAGE_SIZE),
                );
                const currentPage = Math.min(page, totalPages);
                const pageItems = filtered.slice(
                  (currentPage - 1) * PAGE_SIZE,
                  currentPage * PAGE_SIZE,
                );

                return (
                  <SourcesContext.Provider value={data.sources}>
                    <Hero
                      total={items.length}
                      counts={catCounts}
                      generatedAt={data.generatedAt}
                    />

                    <div className={styles.container}>
                      <div
                        className={`${styles.controls} ${
                          controlsHidden ? styles.controlsHidden : ""
                        }`}
                        id="resultados"
                        ref={controlsRef}
                      >
                        <FilterBar
                          query={query}
                          onQuery={setQuery}
                          active={active}
                          onToggle={onToggle}
                          counts={catCounts}
                          resultCount={filtered.length}
                          total={items.length}
                          onClear={onClear}
                        />

                        {filtered.length > 0 && (
                          <div className={styles.subControls}>
                            <ViewToggle
                              view={view}
                              onChange={setView}
                              mapCount={located.length}
                            />
                            {view === "lista" && totalPages > 1 && (
                              <Pagination
                                page={currentPage}
                                totalPages={totalPages}
                                onChange={onChangePage}
                                label="Paginación de resultados (arriba)"
                                compact
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {filtered.length === 0 ? (
                        <Empty query={query} />
                      ) : (
                        <div ref={listTopRef} className={styles.results}>
                          {view === "lista" ? (
                            <section aria-label="Lista de elementos">
                              <ItemList items={pageItems} />
                              {totalPages > 1 && (
                                <Pagination
                                  page={currentPage}
                                  totalPages={totalPages}
                                  onChange={onChangePage}
                                  label="Paginación de resultados (abajo)"
                                />
                              )}
                            </section>
                          ) : (
                            <section
                              className={styles.mapSection}
                              aria-label="Mapa de ubicaciones"
                            >
                              <Suspense
                                fallback={
                                  <div className={styles.mapLoading}>
                                    Cargando mapa…
                                  </div>
                                }
                              >
                                <MapView items={filtered} scrollWheelZoom />
                              </Suspense>
                            </section>
                          )}
                        </div>
                      )}
                    </div>

                    <Footer
                      sources={displaySources}
                      generatedAt={data.generatedAt}
                    />
                  </SourcesContext.Provider>
                );
              })()}
          </>
        )}
      </main>
    </div>
  );
}

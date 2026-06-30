import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useSnapshot } from "@/data/useSnapshot";
import { useRevealOnScrollUp } from "@/hooks/useRevealOnScrollUp";
import { sendBeacon } from "@/track";
import {
  flatten,
  filterItems,
  countByCategory,
  sourcesForDisplay,
} from "@/data/filter";
import { SourcesContext } from "@/data/sources";
import type { Category } from "@/types";

import { MapTrifold } from "@phosphor-icons/react";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import InfiniteList from "@/components/InfiniteList";
import MapOverlay from "@/components/MapOverlay";
import ViewToggle, { type View } from "@/components/ViewToggle";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import LocatedMatches from "@/components/LocatedMatches";
import AboutPage from "@/components/AboutPage";
import ApiAccessPage from "@/components/ApiAccessPage";
import ApiDocsPage from "@/components/ApiDocsPage";
import Interpreters from "@/components/Interpreters";
import Splash from "@/components/Splash";
import { Loading, Empty, ErrorState } from "@/components/States";

import styles from "./App.module.css";

// Leaflet is heavy; code-split it so it only loads when the map view is opened.
const MapView = lazy(() => import("@/components/MapView"));

export default function App() {
  const { data, loading, error } = useSnapshot();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Set<Category>>(new Set());
  const [view, setView] = useState<View>("lista");
  const [route, setRoute] = useState<string>(
    typeof window !== "undefined" ? window.location.hash : "",
  );
  const controlsRef = useRef<HTMLDivElement>(null);
  const HEADER_H = 80;
  // Los controles (búsqueda + filtros) viven en el flujo y se van solos al
  // bajar; al subir reaparece una barra fija de respaldo (headroom).
  const revealControls = useRevealOnScrollUp(controlsRef, HEADER_H);
  const [showSplash, setShowSplash] = useState(true);
  // Mapa a pantalla completa en móvil (en desktop se usa el toggle Lista/Mapa).
  const [mapOpen, setMapOpen] = useState(false);

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

  const isAbout = route === "#/quienes-somos";
  const isInterpreters = route === "#/interpretes";
  const isApiAccess = route === "#/api";
  const isApiDocs = route === "#/api-docs";

  return (
    <div className={styles.page}>
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      <Header />

      <main className={styles.main}>
        {isAbout ? (
          <AboutPage />
        ) : isApiDocs ? (
          <ApiDocsPage />
        ) : isApiAccess ? (
          <ApiAccessPage />
        ) : isInterpreters ? (
          <Interpreters />
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
                // Clave para reiniciar la lista infinita (volver arriba) cuando
                // cambian los filtros.
                const filterKey = `${query}|${[...active].sort().join(",")}`;

                return (
                  <SourcesContext.Provider value={data.sources}>
                    <Hero
                      total={items.length}
                      counts={catCounts}
                      generatedAt={data.generatedAt}
                    />

                    {/* Barra fija de respaldo: reaparece al subir cuando los
                        controles del flujo ya no se ven. Misma búsqueda/filtros
                        (comparten estado). */}
                    <div
                      className={`${styles.revealBar} ${
                        revealControls ? styles.revealBarShown : ""
                      }`}
                      aria-hidden={!revealControls}
                    >
                      <div className={styles.revealBarInner}>
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
                      </div>
                    </div>

                    <div className={styles.container}>
                      {data.matches && data.matches.length > 0 && (
                        <LocatedMatches matches={data.matches} />
                      )}
                      <div
                        className={styles.controls}
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
                          </div>
                        )}
                      </div>

                      {filtered.length === 0 ? (
                        <Empty query={query} />
                      ) : (
                        <div className={styles.results}>
                          {view === "lista" ? (
                            <InfiniteList key={filterKey} items={filtered} />
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

                    {/* Móvil: botón flotante para abrir el mapa a pantalla
                        completa (en desktop se usa el toggle Lista/Mapa). */}
                    {located.length > 0 && !mapOpen && (
                      <button
                        type="button"
                        className={styles.mapFab}
                        onClick={() => setMapOpen(true)}
                      >
                        <MapTrifold
                          size={18}
                          weight="fill"
                          aria-hidden="true"
                        />
                        Ver mapa
                        <span className={styles.mapFabCount}>
                          {located.length.toLocaleString("es")}
                        </span>
                      </button>
                    )}

                    {mapOpen && (
                      <MapOverlay
                        items={filtered}
                        active={active}
                        onToggle={onToggle}
                        counts={catCounts}
                        onClose={() => setMapOpen(false)}
                      />
                    )}

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

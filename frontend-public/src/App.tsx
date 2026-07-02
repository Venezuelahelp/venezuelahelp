import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useSnapshot } from "@/data/useSnapshot";
import { useRevealOnScrollUp } from "@/hooks/useRevealOnScrollUp";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { sendBeacon } from "@/track";
import {
  flatten,
  filterItems,
  countByCategory,
  sourcesForDisplay,
  hasStatusClass,
  sortItems,
} from "@/data/filter";
import { SourcesContext } from "@/data/sources";
import type { Category, SortMode, StatusFilter } from "@/types";

import { MapTrifold } from "@phosphor-icons/react";
import Header from "@/components/Header";
import FilterBar from "@/components/FilterBar";
import InfiniteList from "@/components/InfiniteList";
import MapOverlay from "@/components/MapOverlay";
import ViewToggle, { type View } from "@/components/ViewToggle";
import Footer from "@/components/Footer";
import SourcesPage from "@/components/SourcesPage";
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
  // La búsqueda filtra ~66k ítems: debounce para no recalcular por tecla.
  const debouncedQuery = useDebouncedValue(query, 300);
  const [active, setActive] = useState<Set<Category>>(new Set());
  // Vista "Match": muestra el cruce buscado↔localizado en vez de la lista normal.
  const [matchView, setMatchView] = useState(false);
  // Sub-filtro de status dentro de desaparecidos ("todos" | "buscando" | "localizado").
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sort, setSort] = useState<SortMode>("relevancia");
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
    // Elegir una categoría sale de la vista Match (son excluyentes).
    setMatchView(false);
    if (cat === "desaparecidos" && active.has(cat)) setStatusFilter("todos");
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

  // El chip "Match" no filtra por categoría: muestra el cruce de localizaciones.
  // Al activarlo limpiamos categorías y búsqueda (no aplican a los matches).
  function onToggleMatch() {
    setMatchView((prev) => {
      const next = !prev;
      if (next) {
        setActive(new Set());
        setQuery("");
        setStatusFilter("todos");
      }
      return next;
    });
  }

  function onClear() {
    setQuery("");
    setActive(new Set());
    setMatchView(false);
    setStatusFilter("todos");
  }

  const isAbout = route === "#/quienes-somos";
  const isInterpreters = route === "#/interpretes";
  const isApiAccess = route === "#/api";
  const isApiDocs = route === "#/api-docs";
  const isFuentes = route === "#/fuentes";

  // Derivados memoizados: flatten/filtrado/orden sobre ~66k ítems canónicos
  // no deben recalcularse en cada render (spec E4/E5).
  const items = useMemo(() => (data ? flatten(data) : []), [data]);
  const catCounts = useMemo(() => countByCategory(items), [items]);
  const snapshotHasStatus = useMemo(() => hasStatusClass(items), [items]);
  const filtered = useMemo(
    () => filterItems(items, debouncedQuery, active, statusFilter),
    [items, debouncedQuery, active, statusFilter],
  );
  const sorted = useMemo(() => sortItems(filtered, sort), [filtered, sort]);
  const located = useMemo(
    () => sorted.filter((it) => it.ubicacion != null),
    [sorted],
  );

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
        ) : isFuentes ? (
          loading || !data ? (
            <Loading />
          ) : (
            <SourcesPage
              sources={sourcesForDisplay(
                Object.keys(data.sources ?? {}),
                flatten(data),
              )}
              sourceDir={data.sources}
              generatedAt={data.generatedAt}
            />
          )
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
                // Clave para reiniciar la lista infinita (volver arriba) cuando
                // cambian los filtros.
                const filterKey = `${debouncedQuery}|${[...active].sort().join(",")}|${statusFilter}|${sort}`;
                const matches = data.matches ?? [];
                const matchCount = matches.length;

                return (
                  <SourcesContext.Provider value={data.sources}>
                    <Hero
                      total={items.length}
                      counts={catCounts}
                      generatedAt={data.generatedAt}
                      matchCount={matchCount}
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
                          matchActive={matchView}
                          onToggleMatch={onToggleMatch}
                          matchCount={matchCount}
                          statusFilter={statusFilter}
                          onStatusFilter={setStatusFilter}
                          showStatusFilter={
                            active.has("desaparecidos") && snapshotHasStatus
                          }
                          sort={sort}
                          onSort={setSort}
                        />
                      </div>
                    </div>

                    <div className={styles.container}>
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
                          matchActive={matchView}
                          onToggleMatch={onToggleMatch}
                          matchCount={matchCount}
                          statusFilter={statusFilter}
                          onStatusFilter={setStatusFilter}
                          showStatusFilter={
                            active.has("desaparecidos") && snapshotHasStatus
                          }
                          sort={sort}
                          onSort={setSort}
                        />

                        {!matchView && filtered.length > 0 && (
                          <div className={styles.subControls}>
                            <ViewToggle
                              view={view}
                              onChange={setView}
                              mapCount={located.length}
                            />
                          </div>
                        )}
                      </div>

                      {matchView ? (
                        <LocatedMatches matches={matches} />
                      ) : filtered.length === 0 ? (
                        <Empty query={query} />
                      ) : (
                        <div className={styles.results}>
                          {view === "lista" ? (
                            <InfiniteList key={filterKey} items={sorted} />
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
                                <MapView items={sorted} scrollWheelZoom />
                              </Suspense>
                            </section>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Móvil: botón flotante para abrir el mapa a pantalla
                        completa (en desktop se usa el toggle Lista/Mapa). */}
                    {!matchView && located.length > 0 && !mapOpen && (
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
                        items={sorted}
                        active={active}
                        onToggle={onToggle}
                        counts={catCounts}
                        onClose={() => setMapOpen(false)}
                      />
                    )}

                    <Footer />
                  </SourcesContext.Provider>
                );
              })()}
          </>
        )}
      </main>
    </div>
  );
}

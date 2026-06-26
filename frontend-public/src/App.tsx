import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useSnapshot } from "@/data/useSnapshot";
import { sendBeacon } from "@/track";
import {
  flatten,
  filterItems,
  countByCategory,
  countBySource,
} from "@/data/filter";
import type { Category } from "@/types";

import Header from "@/components/Header";
import Hero from "@/components/Hero";
import FilterBar from "@/components/FilterBar";
import ItemList from "@/components/ItemList";
import Pagination from "@/components/Pagination";
import ViewToggle, { type View } from "@/components/ViewToggle";
import Footer from "@/components/Footer";
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
  const listTopRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const HEADER_H = 56;

  // Fire the analytics beacon once per page load (never blocks render).
  useEffect(() => {
    sendBeacon();
  }, []);

  // Any change to the filters returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [query, active]);

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

  return (
    <div className={styles.page}>
      <Header />

      <main className={styles.main}>
        {loading && <Loading />}

        {error && !loading && <ErrorState onRetry={() => location.reload()} />}

        {data &&
          !loading &&
          !error &&
          (() => {
            const items = flatten(data);
            const filtered = filterItems(items, query, active);
            const located = filtered.filter((it) => it.ubicacion != null);

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
              <>
                <Hero generatedAt={data.generatedAt} />

                <div className={styles.container}>
                  <div className={styles.controls} ref={controlsRef}>
                    <FilterBar
                      query={query}
                      onQuery={setQuery}
                      active={active}
                      onToggle={onToggle}
                      counts={countByCategory(items)}
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
                            <MapView items={filtered} />
                          </Suspense>
                        </section>
                      )}
                    </div>
                  )}
                </div>

                <Footer sources={countBySource(items)} />
              </>
            );
          })()}
      </main>
    </div>
  );
}

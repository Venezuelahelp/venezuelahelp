import { useState } from "react";
import { useSnapshot } from "@/data/useSnapshot";
import { flatten, filterItems, countByCategory } from "@/data/filter";
import type { Category } from "@/types";

import Header from "@/components/Header";
import Hero from "@/components/Hero";
import SummaryBar from "@/components/SummaryBar";
import FilterBar from "@/components/FilterBar";
import MapView from "@/components/MapView";
import ItemList from "@/components/ItemList";
import { Loading, Empty, ErrorState } from "@/components/States";

import styles from "./App.module.css";

export default function App() {
  const { data, loading, error } = useSnapshot();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Set<Category>>(new Set());

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
            return (
              <>
                <Hero generatedAt={data.generatedAt} />

                <div className={styles.container}>
                  <SummaryBar
                    counts={countByCategory(items)}
                    active={active}
                    onToggle={onToggle}
                  />

                  <FilterBar
                    query={query}
                    onQuery={setQuery}
                    active={active}
                    onToggle={onToggle}
                  />

                  {filtered.length === 0 ? (
                    <Empty query={query} />
                  ) : (
                    /* List first in DOM (a11y); CSS `order` keeps the visual
                     layout: list-first on mobile, list-left/map-right desktop. */
                    <div className={styles.results}>
                      <section
                        className={styles.listSection}
                        aria-label="Lista de elementos"
                      >
                        <ItemList items={filtered} />
                      </section>
                      <section
                        className={styles.mapSection}
                        aria-label="Mapa de ubicaciones"
                      >
                        <MapView items={filtered} />
                      </section>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
      </main>
    </div>
  );
}

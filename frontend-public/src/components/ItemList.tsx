import { useState, lazy, Suspense } from "react";
import type { Item } from "@/types";
import { MapPin, Clock, CaretRight, CheckCircle } from "@phosphor-icons/react";
import Badge from "@/components/Badge";
import Source from "@/components/Source";
import Modal from "@/components/Modal";
import { CATEGORY_META } from "@/data/categories";
import { formatDateShort, formatDateTime } from "@/data/datetime";
import styles from "./ItemList.module.css";

// Leaflet es pesado; el mini-mapa del detalle se carga solo al abrir un caso
// con coordenadas (mismo patrón que MapView en App).
const DetailMap = lazy(() => import("@/components/DetailMap"));

const MAX_STAGGER = 8; // cap animation delay at 8th item

interface ItemListProps {
  items: Item[];
}

// Miniatura hotlinkeada a la fuente (Fase 1: no re-hospedamos). Si la imagen
// falla (link roto, hotlink-protection, CORS) se desmonta sin dejar hueco —
// degradación elegante. `referrerPolicy=no-referrer` evita filtrar el origen.
function Thumb({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

// Insignia de corroboración: el enrichment cuenta cuántas fuentes distintas
// reportan el mismo hecho/persona (sourcesCount). ≥2 = corroborado por varias
// fuentes → señal de mayor confianza para el público.
function Corroboration({ item }: { item: Item }) {
  const n = item.sourcesCount ?? 0;
  if (n < 2) return null;
  return (
    <span
      className={styles.corrobora}
      title={`Reportado por ${n} fuentes distintas`}
    >
      <CheckCircle aria-hidden="true" size={13} weight="fill" />
      En {n} fuentes
    </span>
  );
}

function ItemDetail({ item, onClose }: { item: Item; onClose: () => void }) {
  const fecha = formatDateTime(item.firstSeenAt);
  const titleId = "item-detail-title";

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div className={styles.detail}>
        <Badge category={item.category} />
        <h2 id={titleId} className={styles.detailTitle}>
          {item.titulo}
        </h2>

        <div className={styles.detailMeta}>
          {fecha && (
            <span className={styles.detailMetaItem}>
              <Clock aria-hidden="true" size={14} />
              Registrado: {fecha}
            </span>
          )}
          {item.ubicacion?.nombre && (
            <span className={styles.detailMetaItem}>
              <MapPin aria-hidden="true" size={14} weight="fill" />
              {item.ubicacion.nombre}
            </span>
          )}
          <Corroboration item={item} />
        </div>

        {item.ubicacion && (
          <Suspense
            fallback={
              <div className={styles.detailMapFallback}>Cargando mapa…</div>
            }
          >
            <DetailMap
              lat={item.ubicacion.lat}
              lng={item.ubicacion.lng}
              category={item.category}
              title={item.titulo}
            />
          </Suspense>
        )}

        {item.imageUrl && (
          <Thumb src={item.imageUrl} className={styles.detailImage} />
        )}

        {item.texto && <p className={styles.detailText}>{item.texto}</p>}

        <div className={styles.detailFoot}>
          <Source sourceId={item.sourceId} sourceUrl={item.sourceUrl} />
        </div>
      </div>
    </Modal>
  );
}

export default function ItemList({ items }: ItemListProps) {
  const [selected, setSelected] = useState<Item | null>(null);

  return (
    <>
      <ul className={styles.list} role="list">
        {items.map((item, index) => {
          const key = `${item.category}-${item.sourceId}-${item.externalId}`;
          const delayIndex = Math.min(index, MAX_STAGGER);
          const fecha = formatDateShort(item.firstSeenAt);
          const meta = CATEGORY_META[item.category];
          const colorVar = `var(${meta.colorVar})`;

          return (
            <li
              key={key}
              className={styles.row}
              style={
                {
                  "--stagger-i": delayIndex,
                } as React.CSSProperties
              }
            >
              <span
                className={styles.dot}
                style={{ color: colorVar }}
                aria-hidden="true"
              />

              <div className={styles.body}>
                <div className={styles.bodyText}>
                  <button
                    type="button"
                    className={styles.main}
                    onClick={() => setSelected(item)}
                  >
                    <Badge category={item.category} />
                    <span className={styles.title}>{item.titulo}</span>
                    {item.texto && (
                      <span className={styles.text}>{item.texto}</span>
                    )}
                  </button>

                  <div className={styles.meta}>
                    {item.ubicacion?.nombre && (
                      <span className={styles.metaItem}>
                        <MapPin aria-hidden="true" size={13} weight="fill" />
                        {item.ubicacion.nombre}
                      </span>
                    )}
                    {fecha && (
                      <span className={styles.metaItem}>
                        <Clock aria-hidden="true" size={13} />
                        {fecha}
                      </span>
                    )}
                    <span className={styles.metaItem}>
                      <Source
                        sourceId={item.sourceId}
                        sourceUrl={item.sourceUrl}
                      />
                    </span>
                    <Corroboration item={item} />
                  </div>
                </div>

                {item.imageUrl && (
                  <Thumb src={item.imageUrl} className={styles.rowThumb} />
                )}
              </div>

              <CaretRight
                className={styles.go}
                aria-hidden="true"
                size={18}
                weight="bold"
              />
            </li>
          );
        })}
      </ul>

      {selected && (
        <ItemDetail item={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

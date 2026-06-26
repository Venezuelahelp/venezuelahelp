import { useState } from "react";
import type { Item } from "@/types";
import { MapPin, Clock, CaretRight } from "@phosphor-icons/react";
import Badge from "@/components/Badge";
import Source from "@/components/Source";
import Modal from "@/components/Modal";
import { CATEGORY_META } from "@/data/categories";
import { formatDateShort, formatDateTime } from "@/data/datetime";
import styles from "./ItemList.module.css";

const MAX_STAGGER = 8; // cap animation delay at 8th item

interface ItemListProps {
  items: Item[];
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
        </div>

        {item.texto && <p className={styles.detailText}>{item.texto}</p>}

        <div className={styles.detailFoot}>
          <Source sourceId={item.sourceId} />
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
          const colorVar = `var(${CATEGORY_META[item.category].colorVar})`;

          return (
            <li
              key={key}
              className={styles.card}
              style={
                {
                  "--stagger-i": delayIndex,
                  "--row-tint": colorVar,
                } as React.CSSProperties
              }
            >
              <button
                type="button"
                className={styles.cardMain}
                onClick={() => setSelected(item)}
              >
                {/* Header (accent): tipo + título en el color del tipo */}
                <span className={styles.cardHeader}>
                  <span className={styles.cardHeadRow}>
                    <Badge category={item.category} />
                    <CaretRight
                      className={styles.chevron}
                      aria-hidden="true"
                      size={16}
                    />
                  </span>
                  <span className={styles.cardTitle}>{item.titulo}</span>
                </span>

                {/* Body (blanco): detalle */}
                <span className={styles.cardBody}>
                  {item.texto && (
                    <span className={styles.cardText}>{item.texto}</span>
                  )}
                  {item.ubicacion?.nombre && (
                    <span className={styles.cardLoc}>
                      <MapPin aria-hidden="true" size={13} weight="fill" />
                      {item.ubicacion.nombre}
                    </span>
                  )}
                </span>
              </button>

              {/* Footer (blanco): fecha + fuente */}
              <div className={styles.cardFoot}>
                {fecha && (
                  <span className={styles.cardDate}>
                    <Clock aria-hidden="true" size={13} />
                    {fecha}
                  </span>
                )}
                <Source sourceId={item.sourceId} />
              </div>
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

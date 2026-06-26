import type { Item } from "@/types";
import Badge from "@/components/Badge";
import styles from "./ItemList.module.css";

const MAX_STAGGER = 8; // cap animation delay at 8th item

interface ItemListProps {
  items: Item[];
}

export default function ItemList({ items }: ItemListProps) {
  return (
    <ul className={styles.list} role="list">
      {items.map((item, index) => {
        const key = `${item.category}-${item.sourceId}-${item.externalId}`;
        const delayIndex = Math.min(index, MAX_STAGGER);

        return (
          <li
            key={key}
            className={styles.row}
            style={{ "--stagger-i": delayIndex } as React.CSSProperties}
          >
            <div className={styles.rowMeta}>
              <Badge category={item.category} />
              {item.ubicacion?.nombre && (
                <span className={styles.ubicacion}>
                  {item.ubicacion.nombre}
                </span>
              )}
            </div>

            <p className={styles.titulo}>{item.titulo}</p>
            <p className={styles.texto}>{item.texto}</p>

            <span className={styles.source}>{item.sourceId}</span>
          </li>
        );
      })}
    </ul>
  );
}

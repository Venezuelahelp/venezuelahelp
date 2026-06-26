import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./mapPins.css";
import { useState } from "react";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Popup,
  Tooltip,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Crosshair } from "@phosphor-icons/react";
import { CATEGORY_META, CATEGORY_ORDER } from "@/data/categories";
import Source from "@/components/Source";
import type { Item, Category } from "@/types";
import styles from "./MapView.module.css";

// Concrete hex values mirroring the --cat-* OKLCH tokens (Leaflet's marker
// HTML can't resolve CSS custom properties). Keep in sync with DESIGN.md.
const CATEGORY_COLOR: Record<Category, string> = {
  reportes: "#4f6a9e",
  desaparecidos: "#9e7a2a",
  acopios: "#3d8a5a",
  edificios: "#8a4230",
  solicitudes: "#6a4a9e",
};

const USER_COLOR = "#1d6fe0";

// One DivIcon per category, built once and shared by every marker.
const ICONS: Record<Category, L.DivIcon> = Object.fromEntries(
  CATEGORY_ORDER.map((cat) => {
    const Icon = CATEGORY_META[cat].icon;
    const svg = renderToStaticMarkup(
      <Icon size={15} color="#fff" weight="fill" />,
    );
    const html = `<div class="vh-pin" style="background:${CATEGORY_COLOR[cat]}"><span class="vh-pin__i">${svg}</span></div>`;
    return [
      cat,
      L.divIcon({
        html,
        className: "vh-pin-wrap",
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -28],
      }),
    ];
  }),
) as Record<Category, L.DivIcon>;

interface Props {
  items: Item[];
  scrollWheelZoom?: boolean;
}

export default function MapView({ items, scrollWheelZoom = false }: Props) {
  const located = items.filter((it) => it.ubicacion != null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function locate() {
    if (!map || !navigator.geolocation) {
      setGeoError("Geolocalización no disponible en este dispositivo.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(c);
        map.flyTo(c, 13, { duration: 1 });
        setLocating(false);
      },
      () => {
        setGeoError("No pudimos obtener tu ubicación. Revisa los permisos.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className={styles.wrap}>
      <MapContainer
        center={[10.5, -66.9]}
        zoom={7}
        scrollWheelZoom={scrollWheelZoom}
        className={styles.map}
        ref={(m) => {
          if (m) setMap(m);
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
        />

        <MarkerClusterGroup chunkedLoading maxClusterRadius={60}>
          {located.map((item) => {
            const meta = CATEGORY_META[item.category];
            const Icon = meta.icon;
            return (
              <Marker
                key={`${item.category}-${item.sourceId}-${item.externalId}`}
                position={[item.ubicacion!.lat, item.ubicacion!.lng]}
                icon={ICONS[item.category]}
              >
                <Tooltip direction="top" offset={[0, -28]}>
                  {item.titulo}
                </Tooltip>
                <Popup>
                  <div className={styles.popup}>
                    <span
                      className={styles.popupBadge}
                      style={{
                        color: `var(${meta.colorVar})`,
                        background: `color-mix(in oklab, var(${meta.colorVar}) 14%, white)`,
                      }}
                    >
                      <Icon size={13} weight="fill" aria-hidden="true" />
                      {meta.label}
                    </span>

                    <strong className={styles.popupTitle}>{item.titulo}</strong>

                    {item.texto && (
                      <p className={styles.popupText}>{item.texto}</p>
                    )}

                    {item.ubicacion!.nombre && (
                      <span className={styles.popupMeta}>
                        {item.ubicacion!.nombre}
                      </span>
                    )}

                    <Source sourceId={item.sourceId} />
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {userPos && (
          <CircleMarker
            center={userPos}
            radius={9}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: USER_COLOR,
              fillOpacity: 1,
            }}
          >
            <Popup>Tu ubicación</Popup>
          </CircleMarker>
        )}
      </MapContainer>

      <button
        type="button"
        className={styles.locate}
        onClick={locate}
        disabled={locating}
        aria-label="Centrar el mapa en mi ubicación"
        title="Mi ubicación"
      >
        <Crosshair size={20} weight="bold" aria-hidden="true" />
      </button>

      {geoError && (
        <p className={styles.geoError} role="status">
          {geoError}
        </p>
      )}

      <div className={styles.legend} aria-hidden="true">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          return (
            <span key={cat} className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: CATEGORY_COLOR[cat] }}
              >
                <Icon size={10} color="#fff" weight="fill" />
              </span>
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

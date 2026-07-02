import type { Category } from "@/types";
import {
  Warning,
  MagnifyingGlass,
  Package,
  Buildings,
  HandHeart,
  Hospital,
  type Icon,
} from "@phosphor-icons/react";

export const CATEGORY_META: Record<
  Category,
  { label: string; colorVar: string; order: number; icon: Icon }
> = {
  reportes: {
    label: "Reportes",
    colorVar: "--cat-reportes",
    order: 1,
    icon: Warning,
  },
  desaparecidos: {
    label: "Desaparecidos",
    colorVar: "--cat-desaparecidos",
    order: 2,
    icon: MagnifyingGlass,
  },
  acopios: {
    label: "Acopios",
    colorVar: "--cat-acopios",
    order: 3,
    icon: Package,
  },
  edificios: {
    label: "Edificios dañados",
    colorVar: "--cat-edificios",
    order: 4,
    icon: Buildings,
  },
  solicitudes: {
    label: "Solicitudes",
    colorVar: "--cat-solicitudes",
    order: 5,
    icon: HandHeart,
  },
  hospitales: {
    label: "Hospitales",
    colorVar: "--cat-hospitales",
    order: 6,
    icon: Hospital,
  },
};

export const CATEGORY_ORDER: Category[] = (
  Object.keys(CATEGORY_META) as Category[]
).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);

/**
 * Categorías que se ofrecen como opción en el selector de filtros del público.
 * Es CATEGORY_ORDER menos `reportes`: la categoría sigue existiendo en los
 * datos (snapshot, conteos, mapa y API pública) pero NO se muestra como chip de
 * filtro (#51). Mantener aparte de CATEGORY_ORDER evita dejar ítems huérfanos.
 */
export const FILTER_CATEGORY_ORDER: Category[] = CATEGORY_ORDER.filter(
  (c) => c !== "reportes",
);

// Equivalentes hex de los tokens --cat-* (OKLCH) para contextos que no resuelven
// custom properties de CSS (el HTML de los marcadores de Leaflet). Mantener en
// sync con DESIGN.md / tokens.css.
export const CATEGORY_HEX: Record<Category, string> = {
  reportes: "#4f6a9e",
  desaparecidos: "#9e7a2a",
  acopios: "#3d8a5a",
  edificios: "#8a4230",
  solicitudes: "#6a4a9e",
  hospitales: "#1f8a8c",
};

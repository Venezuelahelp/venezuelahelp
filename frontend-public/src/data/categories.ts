import type { Category } from "@/types";
import {
  Warning,
  MagnifyingGlass,
  Package,
  Buildings,
  HandHeart,
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
};

export const CATEGORY_ORDER: Category[] = (
  Object.keys(CATEGORY_META) as Category[]
).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);

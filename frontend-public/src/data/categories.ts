import type { Category } from "@/types";

export const CATEGORY_META: Record<
  Category,
  { label: string; colorVar: string; order: number }
> = {
  reportes: { label: "Reportes", colorVar: "--cat-reportes", order: 1 },
  desaparecidos: {
    label: "Desaparecidos",
    colorVar: "--cat-desaparecidos",
    order: 2,
  },
  acopios: { label: "Acopios", colorVar: "--cat-acopios", order: 3 },
  edificios: {
    label: "Edificios dañados",
    colorVar: "--cat-edificios",
    order: 4,
  },
  solicitudes: {
    label: "Solicitudes",
    colorVar: "--cat-solicitudes",
    order: 5,
  },
};

export const CATEGORY_ORDER: Category[] = (
  Object.keys(CATEGORY_META) as Category[]
).sort((a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order);

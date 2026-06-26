export interface Category {
  key: string;
  label: string;
  colorVar: string;
  order: number;
}

export const CATEGORIES: Category[] = [
  { key: "reportes", label: "Reportes", colorVar: "--cat-reportes", order: 0 },
  {
    key: "desaparecidos",
    label: "Desaparecidos",
    colorVar: "--cat-desaparecidos",
    order: 1,
  },
  { key: "acopios", label: "Acopios", colorVar: "--cat-acopios", order: 2 },
  {
    key: "edificios",
    label: "Edificios",
    colorVar: "--cat-edificios",
    order: 3,
  },
  {
    key: "solicitudes",
    label: "Solicitudes",
    colorVar: "--cat-solicitudes",
    order: 4,
  },
];

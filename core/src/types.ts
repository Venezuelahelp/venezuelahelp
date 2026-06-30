export const CATEGORIES = [
  "reportes",
  "desaparecidos",
  "acopios",
  "edificios",
  "solicitudes",
  "hospitales",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Ubicacion {
  lat: number;
  lng: number;
  nombre?: string;
}

export interface PublicItem {
  category: string;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: Ubicacion;
  status?: string;
  sourceUrl?: string;
  trust?: "verificado" | "corroborado" | "no_verificado" | "sospechoso";
  isCanonical?: boolean;
  dupOf?: string;
  sourcesCount?: number;
  trustReasons?: string[];
}

export interface Snapshot {
  generatedAt: string;
  categories: Record<string, PublicItem[]>;
  sources?: Record<string, { nombre: string; url?: string }>;
}

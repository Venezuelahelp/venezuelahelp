export type Category =
  | "reportes"
  | "desaparecidos"
  | "acopios"
  | "edificios"
  | "hospitales"
  | "solicitudes";

export interface Ubicacion {
  lat: number;
  lng: number;
  nombre?: string;
}

export interface Item {
  category: Category;
  sourceId: string;
  externalId: string;
  titulo: string;
  texto: string;
  ubicacion?: Ubicacion;
  status?: string;
  /** URL absoluta de la foto en la fuente original (hotlink, no re-hospedada). */
  imageUrl?: string;
  /** URL absoluta del ítem en su origen (permalink). Cae a la home de la fuente si falta. */
  sourceUrl?: string;
  /** ISO — primera vez que la plataforma agregó este ítem ("Registrado"). */
  firstSeenAt?: string;
  /** ISO — última vez que se vio en una fuente. */
  lastSeenAt?: string;
  // ── Marcas de enrichment (dedup + corroboración), calculadas en cada scrape ──
  /** Nivel de confianza derivado. */
  trust?: "verificado" | "corroborado" | "no_verificado" | "sospechoso";
  /** Cuántas fuentes distintas reportan este mismo hecho/persona. */
  sourcesCount?: number;
  /** false = es un duplicado de otro ítem (no se muestra). undefined = único. */
  isCanonical?: boolean;
  /** Si es duplicado, la clave del ítem canónico. */
  dupOf?: string;
}

export interface SourceInfo {
  nombre: string;
  url?: string;
}

export interface Snapshot {
  generatedAt: string;
  /** id → nombre + url. Emitido por el backend para enlazar cada fuente. */
  sources?: Record<string, SourceInfo>;
  categories: Record<Category, Item[]>;
}

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
  /** Clase canónica del status (solo desaparecidos; emitida por el enrichment
   *  del backend). El frontend NUNCA parsea `status` crudo: usa solo este campo.
   *  Ausente en snapshots viejos → feature-detect. */
  statusClass?: "buscando" | "localizado";
}

/** Sub-filtro de status para la categoría desaparecidos. */
export type StatusFilter = "todos" | "buscando" | "localizado";

export interface SourceInfo {
  nombre: string;
  url?: string;
}

/** Coincidencia automática buscado↔localizado. Nunca afirma; el público la
 * muestra en la sección "Posibles localizaciones". */
export interface LocatedMatch {
  nombre: string;
  signal: "cédula" | "teléfono" | "hospital" | "nombre-fuerte";
  /** Fuentes distintas que respaldan la localización (≥2 ⇒ azul). */
  locatedSourcesCount: number;
  missing: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
  };
  located: {
    sourceId: string;
    texto: string;
    status?: string;
    sourceUrl?: string;
    hospital?: string;
    sources: string[];
  };
}

export interface Snapshot {
  generatedAt: string;
  /** id → nombre + url. Emitido por el backend para enlazar cada fuente. */
  sources?: Record<string, SourceInfo>;
  categories: Record<Category, Item[]>;
  /** Cruce "posibles localizaciones" (opcional: snapshots viejos no lo traen). */
  matches?: LocatedMatch[];
}

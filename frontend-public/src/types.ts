export type Category =
  | "reportes"
  | "desaparecidos"
  | "acopios"
  | "edificios"
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
  /** ISO — primera vez que la plataforma agregó este ítem ("Registrado"). */
  firstSeenAt?: string;
  /** ISO — última vez que se vio en una fuente. */
  lastSeenAt?: string;
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

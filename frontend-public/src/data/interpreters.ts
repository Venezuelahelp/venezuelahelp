import { useEffect, useState } from "react";

// Sección de intérpretes: se consume EN VIVO desde el backend Supabase de
// interp-aid.lovable.app, NO pasa por el snapshot/scraper. Así no inflamos el
// snapshot (son ~40k registros) ni almacenamos PII de nuestro lado: cada
// búsqueda consulta la fuente con filtros + paginación de PostgREST.
const SUPABASE_URL = "https://lnpyjtajdnkobxebjecp.supabase.co";
// Publishable/anon key pública (va embebida en el cliente de la fuente; solo da
// lectura según sus RLS). Pueden rotarla; si pasa, esta sección dejaría de cargar.
const ANON_KEY = "sb_publishable_mCcuXd3iKfGahUMP3qVCTg_74_J9Ct4";

export const SOURCE_URL = "https://interp-aid.lovable.app/buscar";
export const PAGE_SIZE = 20;

export const LANGUAGES = [
  "Inglés",
  "Portugués",
  "Francés",
  "Italiano",
  "Alemán",
  "Chino",
  "Japonés",
  "Árabe",
  "Ruso",
  "Otro",
] as const;

export const SUPPORT_TYPES = [
  "Traducción remota (telefónica/online)",
  "Traducción presencial en el terreno",
] as const;

export const FLUENCY = ["Nativo/Bilingüe", "Avanzado", "Intermedio"] as const;

export interface Interpreter {
  id: string;
  full_name: string | null;
  languages: string[] | null;
  fluency: string | null;
  city: string | null;
  state: string | null;
  in_venezuela: boolean | null;
  can_travel: boolean | null;
  availability: string[] | null;
  support_types: string[] | null;
  contact_channels: string[] | null;
  phone: string | null;
  email: string | null;
}

export interface InterpreterFilters {
  q: string;
  language: string;
  supportType: string;
  fluency: string;
  inVenezuela: boolean;
}

export const EMPTY_FILTERS: InterpreterFilters = {
  q: "",
  language: "",
  supportType: "",
  fluency: "",
  inVenezuela: false,
};

const COLUMNS =
  "id,full_name,languages,fluency,city,state,in_venezuela,can_travel,availability,support_types,contact_channels,phone,email";

function buildUrl(f: InterpreterFilters, page: number): string {
  const p: string[] = [
    `select=${encodeURIComponent(COLUMNS)}`,
    "order=created_at.desc",
    `limit=${PAGE_SIZE}`,
    `offset=${(page - 1) * PAGE_SIZE}`,
  ];
  if (f.inVenezuela) p.push("in_venezuela=eq.true");
  if (f.language) p.push(`languages=cs.${encodeURIComponent(`{"${f.language}"}`)}`);
  if (f.supportType)
    p.push(`support_types=cs.${encodeURIComponent(`{"${f.supportType}"}`)}`);
  if (f.fluency) p.push(`fluency=eq.${encodeURIComponent(f.fluency)}`);
  if (f.q.trim()) {
    // Neutraliza los metacaracteres de PostgREST (`*,()`) en el término libre.
    const term = f.q.trim().replace(/[%,()*]/g, " ").trim();
    if (term)
      p.push(
        `or=${encodeURIComponent(`(full_name.ilike.*${term}*,city.ilike.*${term}*)`)}`,
      );
  }
  return `${SUPABASE_URL}/rest/v1/volunteers?${p.join("&")}`;
}

export function useInterpreters(filters: InterpreterFilters, page: number) {
  const [rows, setRows] = useState<Interpreter[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch(buildUrl(filters, page), {
      signal: ctrl.signal,
      headers: { apikey: ANON_KEY, Prefer: "count=exact" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const range = r.headers.get("content-range") ?? "";
        const t = Number(range.split("/")[1]);
        const data = (await r.json()) as Interpreter[];
        if (!alive) return;
        setRows(data);
        setTotal(Number.isFinite(t) ? t : data.length);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive || (e instanceof DOMException && e.name === "AbortError"))
          return;
        setError(e instanceof Error ? e.message : "error");
        setLoading(false);
      });

    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [
    filters.q,
    filters.language,
    filters.supportType,
    filters.fluency,
    filters.inVenezuela,
    page,
  ]);

  return { rows, total, loading, error };
}

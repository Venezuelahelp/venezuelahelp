import { SourceRepo } from "@/shared/repos/sourceRepo";
import type { Source } from "@/shared/types";
import { PRESETS } from "@/connectors/presets";

const SEED: Source[] = [
  {
    id: "terremotovenezuela",
    nombre: "Terremoto Venezuela",
    url: "https://terremotovenezuela.app/",
    connector: "jsonApi",
    enabled: true,
  },
  {
    // Registro público de niños rescatados (categoría desaparecidos). Backend
    // Supabase; lectura anónima. El conector expone los datos del niño (incl.
    // foto y cédula) y excluye los datos de quien registra, teléfonos y notas
    // médicas. Recomendado: coordinar con el operador y pedir API key propia.
    id: "ninosvenezuela",
    nombre: "Niños Venezuela",
    url: "https://ninosvenezuela.org/",
    connector: "jsonApi",
    enabled: true,
  },
  {
    // Centros de salud con estado operativo y capacidad (categoría hospitales).
    // Backend Supabase; lectura anónima. Datos del CENTRO (no PII).
    id: "hospitalesvenezuela",
    nombre: "Hospitales en Venezuela",
    url: "https://hospitalesenvenezuela.com/",
    connector: "jsonApi",
    enabled: true,
  },
  {
    // Sismos oficiales de USGS (GeoJSON), acotados a Venezuela. Migrada de `ai`.
    id: "usgs",
    nombre: "USGS",
    url: "https://www.usgs.gov/programs/earthquake-hazards",
    connector: "rest",
    rest: PRESETS.usgs,
    enabled: true,
  },
  {
    // Avisos públicos (necesidades/ofertas), Supabase. Migrada de `ai`.
    id: "vzlayuda",
    nombre: "Vzlayuda",
    url: "https://vzlayuda.com/",
    connector: "rest",
    rest: PRESETS.vzlayuda,
    enabled: true,
  },
  {
    // Personas + centros + muro, API Express. Migrada de `ai`.
    id: "sos-en-venezuela",
    nombre: "Sos en Venezuela",
    url: "https://sosenvenezuela.com/sos/",
    connector: "rest",
    rest: PRESETS["sos-en-venezuela"],
    enabled: true,
  },
  {
    // Directorio de hospitales (los pacientes no son enumerables). Migrada de `ai`.
    id: "localiza-pacientes",
    nombre: "Localiza Pacientes",
    url: "https://localizapacientes.com/",
    connector: "rest",
    rest: PRESETS["localiza-pacientes"],
    enabled: true,
  },
  {
    // Supabase: desaparecidos (espejo público de theempire, sin reCAPTCHA) +
    // acopios + necesidades. Migrada de `ai`. Pagina ~32k desaparecidos.
    id: "red-esperanza",
    nombre: "Red Esperanza",
    url: "https://red-de-esperanza-lime.vercel.app/",
    connector: "rest",
    rest: PRESETS["red-esperanza"],
    enabled: true,
  },
  {
    // Pacientes hospitalizados (Google Sheet pública). Migrada de `ai`.
    id: "pacientesve",
    nombre: "pacientesve",
    url: "https://pacientesve.com/",
    connector: "rest",
    rest: PRESETS.pacientesve,
    enabled: true,
  },
  {
    // Venezuela Reporta (antes "venezuela-te-busca", que era solo un frontend
    // sobre venezuelareporta.org). API pública `/api/v1`: ~46k desaparecidos
    // (cap 25k) + ~68 acopios. Migrada de `ai` a `rest`. El id se conserva para
    // que ensureSeedSources repare la fuente existente por su id.
    id: "venezuela-te-busca",
    nombre: "Venezuela Reporta",
    url: "https://venezuelareporta.org/",
    connector: "rest",
    rest: PRESETS["venezuela-te-busca"],
    enabled: true,
  },
  {
    // Agregador con API JSON propia y abierta. /api/reports (mapa en vivo:
    // edificios/acopios/reportes con geo) + /api/persons/list (~52k
    // desaparecidos/localizados, paginado). Conector bespoke jsonApi (categoría
    // por fila). Espejo de desaparecidosvenezuela.com/terremotovenezuela.com →
    // el dedup colapsa solapes y suma corroboración. <!-- /aprende 2026-07-01 -->
    id: "sosvenezuela2026",
    nombre: "SOS Venezuela 2026",
    url: "https://sosvenezuela2026.com/",
    connector: "jsonApi",
    enabled: true,
  },
  {
    // Fuente conocida pero BLOQUEADA: su API (desaparecidos-terremoto-api.
    // theempire.tech) exige x-recaptcha-token (reCAPTCHA v3) verificado en
    // backend → sin conector HTTP simple. Se siembra deshabilitada y marcada
    // `blocked` para que figure en el admin como pendiente (outreach a The
    // Empire Tech), sin intentos de scrape. Ver docs/outreach/. <!-- /aprende 2026-06-29 -->
    id: "desaparecidosterremotovenezuela",
    nombre: "Desaparecidos Terremoto Venezuela",
    url: "https://desaparecidosterremotovenezuela.com/",
    connector: "jsonApi",
    enabled: false,
    status: "blocked",
    errorMsg: "Bloqueada por reCAPTCHA v3 (pendiente de acceso del operador)",
  },
];

export async function ensureSeedSources(
  repo: SourceRepo = new SourceRepo(),
): Promise<void> {
  for (const s of SEED) {
    const existing = await repo.get(s.id);
    if (!existing) {
      await repo.put(s);
      continue;
    }
    // Repara la config base de la fuente (connector/rest/nombre/url) por si el
    // seed cambió (p.ej. migración a `rest`), preservando el estado operativo
    // del admin (enabled, trustLevel, timestamps, status, stats).
    const repaired: Source = {
      ...existing,
      nombre: s.nombre,
      url: s.url,
      connector: s.connector,
      rest: s.rest,
    };
    await repo.put(repaired);
  }
}

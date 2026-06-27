import { SourceRepo } from "@/shared/repos/sourceRepo";
import type { Source } from "@/shared/types";

const SEED: Source[] = [
  {
    id: "sismovenezuela",
    nombre: "SismoVenezuela",
    url: "https://www.sismovenezuela.com/",
    connector: "jsonApi",
    enabled: true,
  },
  {
    id: "terremotovenezuela",
    nombre: "Terremoto Venezuela",
    url: "https://terremotovenezuela.app/",
    connector: "jsonApi",
    enabled: true,
  },
  {
    // Registro público de niños rescatados (categoría desaparecidos). Backend
    // Supabase; lectura anónima. Se siembra DESHABILITADO a propósito: ingerir
    // PII de menores debe coordinarse antes con el operador del sitio. Activar
    // con el toggle del admin una vez acordado.
    id: "ninosvenezuela",
    nombre: "Niños Venezuela",
    url: "https://ninosvenezuela.org/",
    connector: "jsonApi",
    enabled: false,
  },
];

export async function ensureSeedSources(
  repo: SourceRepo = new SourceRepo(),
): Promise<void> {
  for (const s of SEED) {
    const existing = await repo.get(s.id);
    if (!existing) await repo.put(s);
  }
}

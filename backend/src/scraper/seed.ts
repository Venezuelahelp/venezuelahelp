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
    // Supabase; lectura anónima. El conector expone los datos del niño (incl.
    // foto y cédula) y excluye los datos de quien registra, teléfonos y notas
    // médicas. Recomendado: coordinar con el operador y pedir API key propia.
    id: "ninosvenezuela",
    nombre: "Niños Venezuela",
    url: "https://ninosvenezuela.org/",
    connector: "jsonApi",
    enabled: true,
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

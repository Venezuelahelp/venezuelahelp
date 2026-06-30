import { normalize } from "./text";

// Señales léxicas que delatan a qué categoría apunta la pregunta. Se evalúan
// sobre la pregunta normalizada COMPLETA (no sobre las keywords filtradas),
// porque varias señales ("necesito") son stopwords para el scoring.
export const CATEGORY_SIGNALS: Record<string, string[]> = {
  desaparecidos: [
    "desaparecid",
    "perdid",
    "buscando",
    "busco",
    "localizar",
    "paradero",
    "encontrar",
  ],
  acopios: [
    "acopio",
    "donar",
    "donacion",
    "donativo",
    "recolecta",
    "entregar",
    "llevar",
    "colaborar",
  ],
  edificios: [
    "edificio",
    "residencia",
    "torre",
    "colaps",
    "grieta",
    "estructura",
    "inmueble",
    "vivienda",
  ],
  solicitudes: [
    "solicit",
    "necesit",
    "requier",
    "hace falta",
    "urge",
    "ayuda con",
  ],
  reportes: [
    "noticia",
    "reporte",
    "cifra",
    "muert",
    "fallecid",
    "herid",
    "balance",
    "victima",
  ],
  hospitales: [
    "hospital",
    "clinic",
    "ambulatori",
    "centro de salud",
    "emergencia",
    "cama",
    "ingresad",
    "atencion medica",
    "salud",
  ],
};

export function inferCategories(question: string): Set<string> {
  const q = normalize(question);
  const hit = new Set<string>();
  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS)) {
    if (signals.some((s) => q.includes(s))) hit.add(cat);
  }
  return hit;
}

// Etiquetas legibles por categoría para las respuestas de conteo del bot.
export const CAT_LABEL: Record<string, string> = {
  reportes: "reportes",
  desaparecidos: "personas desaparecidas",
  acopios: "centros de acopio",
  edificios: "edificios dañados",
  solicitudes: "solicitudes de ayuda",
  hospitales: "hospitales",
};

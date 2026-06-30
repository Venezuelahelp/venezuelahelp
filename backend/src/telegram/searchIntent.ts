import { normalize } from "@venezuelahelp/core";

// Patrón traído de alo-ai-engine (IntentClassifier regex-first): detectar de
// forma determinista y barata una intención SIN el dato necesario, para pedirlo
// en vez de cortar con "No tengo ese dato".

const SEARCH_VERBS = new Set([
  "buscar",
  "busca",
  "busco",
  "buscando",
  "encontrar",
  "encuentra",
  "encontra",
  "localizar",
  "localiza",
  "hallar",
  "ubicar",
  "ubica",
]);

// Palabras genéricas + conectores que NO aportan un nombre/lugar concreto. Si el
// mensaje se compone SOLO de estas (más un verbo de búsqueda), es una intención
// de búsqueda de persona sin término → pedir el nombre.
const GENERIC = new Set([
  "persona",
  "personas",
  "alguien",
  "gente",
  "familiar",
  "familiares",
  "desaparecido",
  "desaparecida",
  "desaparecidos",
  "desaparecidas",
  "ser",
  "querido",
  "querida",
  "contacto",
  "a",
  "una",
  "un",
  "unos",
  "unas",
  "mi",
  "su",
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "por",
  "favor",
  "ayuda",
  "ayudar",
  "ayudame",
  "quiero",
  "necesito",
  "como",
  "puedo",
  "me",
  "para",
  "mas",
  "info",
  "informacion",
  "alguno",
  "alguna",
  "este",
  "esta",
]);

/**
 * True cuando el mensaje es una intención de búsqueda de persona SIN un término
 * concreto (sin nombre): hay un verbo de búsqueda y todos los demás tokens son
 * genéricos/conectores. "Buscar a una persona" → true; "buscar a Juan" → false
 * (Juan no es genérico); "buscar refugios" → false (refugios no es genérico).
 */
export function isBareSearchIntent(question: string): boolean {
  const toks = normalize(question).split(" ").filter(Boolean);
  if (toks.length === 0) return false;
  if (!toks.some((t) => SEARCH_VERBS.has(t))) return false;
  return toks.every((t) => SEARCH_VERBS.has(t) || GENERIC.has(t));
}

export const ASK_FOR_NAME =
  "¿A quién buscas? Escríbeme el nombre y apellido de la persona y reviso los reportes de personas desaparecidas. 🔎";

/** Mensaje cuando, ya con el nombre, no aparece nadie en los reportes. */
export function notFoundByName(nombre: string): string {
  const n = nombre.trim();
  return (
    `No encontré a ${n} en los reportes que tengo ahora mismo. ` +
    `Puede que aún no esté publicado o que el nombre esté escrito distinto. ` +
    `Prueba con el nombre completo (nombre y apellido) o vuelve a consultar más tarde.`
  );
}

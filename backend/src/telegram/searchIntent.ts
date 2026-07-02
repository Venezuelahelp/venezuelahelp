import { normalize, STOP } from "@venezuelahelp/core";

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

// Mapa palabra→action del menú (LOCATION_ACTIONS de menu.ts). Si el usuario
// nombra una categoría sin zona, pedimos la ubicación (mejor UX que listar todo).
// Solo NOMBRES de categoría inequívocos. NO palabras de contenido (agua, comida)
// que son consultas legítimas ("dónde hay agua" → búsqueda, no pedir ubicación).
const CATEGORY_WORD_TO_ACTION: Record<string, string> = {
  acopio: "insumos",
  acopios: "insumos",
  insumo: "insumos",
  insumos: "insumos",
  refugio: "refugios",
  refugios: "refugios",
  albergue: "refugios",
  albergues: "refugios",
  vivere: "viveres",
  viveres: "viveres",
  voluntariado: "voluntariado",
  voluntario: "voluntariado",
  voluntarios: "voluntariado",
};

// Conectores que pueden acompañar a la categoría sin aportar una zona concreta.
const CATEGORY_FILLER = new Set([
  "ver",
  "los",
  "las",
  "el",
  "la",
  "un",
  "una",
  "de",
  "del",
  "donde",
  "hay",
  "centro",
  "centros",
  "punto",
  "puntos",
  "quiero",
  "necesito",
  "busco",
  "buscar",
  "muestrame",
  "dame",
  "info",
  "informacion",
  "cerca",
  "lista",
  "listar",
  "que",
  "hay",
]);

/**
 * Si el mensaje es SOLO una categoría (acopios/refugios/víveres/voluntariado)
 * sin una zona concreta, devuelve la action del menú para pedir la ubicación.
 * "acopios" → "insumos"; "refugios cerca" → "refugios"; "acopios en Petare" →
 * null (hay zona → se busca normal).
 */
export function bareCategoryAction(question: string): string | null {
  const toks = normalize(question).split(" ").filter(Boolean);
  if (toks.length === 0) return null;
  let action: string | null = null;
  for (const t of toks) {
    const a = CATEGORY_WORD_TO_ACTION[t];
    if (a) {
      action = a;
    } else if (!CATEGORY_FILLER.has(t)) {
      // Token que no es categoría ni conector → probablemente una zona/nombre.
      return null;
    }
  }
  return action;
}

// Un nombre propio suelto tiene entre 2 y 4 palabras (nombre[s] + apellido[s]).
const NAME_MIN_TOKENS = 2;
const NAME_MAX_TOKENS = 4;

/**
 * True cuando el mensaje TIENE PINTA de un nombre propio suelto (p. ej. "Robeth
 * Enrique", "Ana Pérez"): 2–4 palabras, todas alfabéticas, sin signos de
 * interrogación y sin ninguna palabra que delate una pregunta/comando/categoría
 * (interrogativos y artículos de STOP, verbos de búsqueda, genéricos de persona,
 * o nombres de categoría). Es un PRE-FILTRO barato: no confirma que la persona
 * exista, solo evita disparar la búsqueda por nombre ante preguntas ("dónde hay
 * agua" tiene "donde"/"hay") o mensajes fuera de tema ("cuéntame un chiste"
 * tiene "un"). El llamador debe confirmar con una búsqueda real antes de
 * responder, para que un off-topic sin match caiga al router y se rechace.
 */
export function looksLikePersonName(question: string): boolean {
  if (/[?¿]/.test(question)) return false;
  const toks = normalize(question).split(" ").filter(Boolean);
  if (toks.length < NAME_MIN_TOKENS || toks.length > NAME_MAX_TOKENS)
    return false;
  return toks.every(
    (t) =>
      /^[a-z]+$/.test(t) &&
      !STOP.has(t) &&
      !SEARCH_VERBS.has(t) &&
      !GENERIC.has(t) &&
      !CATEGORY_WORD_TO_ACTION[t] &&
      !CATEGORY_FILLER.has(t),
  );
}

/** Mensaje cuando, ya con el nombre, no aparece nadie en los reportes. */
export function notFoundByName(nombre: string): string {
  const n = nombre.trim();
  return (
    `No encontré a ${n} en los reportes que tengo ahora mismo. ` +
    `Puede que aún no esté publicado o que el nombre esté escrito distinto. ` +
    `Prueba con el nombre completo (nombre y apellido) o vuelve a consultar más tarde.`
  );
}

import { normalize, countItems, inferCategories } from "@venezuelahelp/core";
import type { Snapshot } from "@/telegram/types";

// Re-export para compatibilidad de imports internos del bot.
export {
  normalize,
  keywords,
  inferCategories,
  CATEGORY_SIGNALS,
  CAT_LABEL,
  scoreFields,
  retrieve,
  categoryStat,
  plural,
} from "@venezuelahelp/core";

// --- Conteo determinista (formato de respuesta del bot) ---
export function countAnswer(question: string, snap: Snapshot): string | null {
  const n = normalize(question);
  const isCount = ["cuant", "numero", "cantidad", "total"].some((s) =>
    n.includes(s),
  );
  if (!isCount) return null;
  const targets = inferCategories(question);
  const category = targets.size === 1 ? [...targets][0] : undefined;
  return countItems(snap, { category });
}

// --- Intención "cómo pido ayuda" + grito de auxilio escueto ---
const HELP_PHRASES = [
  "solicitar ayuda",
  "pedir ayuda",
  "pido ayuda",
  "como solicito",
  "como pido",
  "conseguir ayuda",
  "consigo ayuda",
  "quiero ayuda",
  "donde pido",
];
const HELP_CRIES = [
  "ayuda",
  "ayudame",
  "ayudenme",
  "ayudenos",
  "auxilio",
  "socorro",
];
const HELP_FILLER = new Set([
  ...HELP_CRIES,
  "necesito",
  "quiero",
  "por",
  "favor",
  "porfa",
  "porfavor",
  "hola",
  "una",
  "algo",
  "alguna",
]);
function isBareHelpCry(n: string): boolean {
  const words = n.split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const hasCry = words.some((w) => HELP_CRIES.includes(w));
  return hasCry && words.every((w) => HELP_FILLER.has(w));
}
export function isHelpRequest(question: string): boolean {
  const n = normalize(question);
  return HELP_PHRASES.some((p) => n.includes(p)) || isBareHelpCry(n);
}

// Solo el grito de auxilio escueto ("necesito ayuda", "auxilio") — para
// distinguirlo de "cómo pido ayuda" y mostrarle el menú de recursos con botones.
export function isHelpCry(question: string): boolean {
  return isBareHelpCry(normalize(question));
}

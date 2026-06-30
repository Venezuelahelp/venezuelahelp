const STOP = new Set([
  "que",
  "donde",
  "como",
  "cual",
  "cuales",
  "hay",
  "los",
  "las",
  "del",
  "para",
  "con",
  "una",
  "uno",
  "por",
  "qué",
  "dónde",
  "cómo",
  "the",
  "and",
  "está",
  "estan",
  "este",
  "esta",
  "esto",
  "tengo",
  "necesito",
  "puedo",
]);

export function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Recorta sufijos de plural/género para que una keyword en plural ("edificios",
// "desaparecidos") matchee datos en singular u otro género ("edificio",
// "desaparecida"). Solo se aplica a palabras suficientemente largas para no
// generar raíces ambiguas.
function stem(w: string): string {
  if (w.length < 5) return w;
  for (const suf of ["os", "as", "es"]) {
    if (w.endsWith(suf)) return w.slice(0, -2);
  }
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function keywords(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem);
}

export { STOP, stem, keywords };

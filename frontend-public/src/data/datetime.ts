// Formateo de fechas en es-VE. Devuelve null si la fecha es inválida o ausente,
// para que la UI simplemente no muestre nada en vez de "Invalid Date".

function parse(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** "26 de junio de 2026, 2:11 p. m." — para el detalle. */
export function formatDateTime(iso?: string): string | null {
  const d = parse(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

/** "26 jun 2026" — compacto, para la fila de la lista. */
export function formatDateShort(iso?: string): string | null {
  const d = parse(iso);
  if (!d) return null;
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

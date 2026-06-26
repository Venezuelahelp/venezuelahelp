// Parser mínimo de User-Agent (sin dependencia externa, testeable). Detecta
// navegador, tipo de dispositivo y SO de forma aproximada — suficiente para una
// analítica agregada. Cualquier cosa desconocida cae en defaults seguros.

export type Device = "mobile" | "tablet" | "desktop";

export interface ParsedUa {
  browser: string;
  device: Device;
  os: string;
}

export function parseUserAgent(ua: string | undefined): ParsedUa {
  const s = ua ?? "";

  // Navegador. El orden importa: Edge/Opera/Samsung incluyen "Chrome" en su UA,
  // así que se evalúan antes que Chrome; Chrome incluye "Safari", etc.
  let browser = "Otro";
  if (/\bEd-?g(e|ios|a)?\//i.test(s)) browser = "Edge";
  else if (/\bOPR\/|\bOpera\//i.test(s)) browser = "Opera";
  else if (/SamsungBrowser\//i.test(s)) browser = "Samsung Internet";
  else if (/\bFirefox\/|\bFxiOS\//i.test(s)) browser = "Firefox";
  else if (/\bChrome\/|\bCriOS\//i.test(s)) browser = "Chrome";
  else if (/\bSafari\//i.test(s) && /\bVersion\//i.test(s)) browser = "Safari";
  else if (s === "") browser = "unknown";

  // SO.
  let os = "Otro";
  if (/Windows NT/i.test(s)) os = "Windows";
  else if (/iPhone|iPad|iPod|iOS/i.test(s)) os = "iOS";
  else if (/Android/i.test(s)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";
  else if (s === "") os = "unknown";

  // Dispositivo.
  let device: Device = "desktop";
  if (
    /iPad|Tablet|PlayBook|Silk/i.test(s) ||
    (/Android/i.test(s) && !/Mobile/i.test(s))
  ) {
    device = "tablet";
  } else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s)) {
    device = "mobile";
  }

  return { browser, device, os };
}

// Beacon de analítica: avisa una vez por carga que alguien visitó el sitio.
// Fire-and-forget, sin UI, sin cookies de tracking. El país lo deriva el backend
// del header de CloudFront; aquí solo mandamos ruta y referrer. Cualquier error
// se ignora — el beacon NUNCA debe afectar el render del sitio.

export function sendBeacon(): void {
  try {
    const body = JSON.stringify({
      path: location.pathname,
      referrer: document.referrer,
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      void fetch("/api/track", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body,
      });
    }
  } catch {
    /* nunca rompe el render */
  }
}

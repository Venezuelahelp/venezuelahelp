# Solicitud de acceso (API key) — Venezuela Te Busca

**Para:** _(pendiente: el sitio no publica un correo del operador. Buscar contacto del autor **hellogafaro** — p.ej. su GitHub/X, o un formulario de contacto en la app)_
**Asunto:** Colaboración VenezuelaHelp — API key de lectura para desaparecidos (terremoto 25-jun)

---

Hola:

Les escribo de **VenezuelaHelp** (https://venezuelahelp.click), un agregador **sin fines de lucro** que reúne información del terremoto del 25 de junio desde fuentes públicas de terceros y la expone en una web pública y un bot de Telegram con búsqueda. El objetivo es que más gente encuentre rápido a las personas desaparecidas.

Vimos que **Venezuela Te Busca** (`venezuela-te-busca-app.hellogafaro.workers.dev`) tiene una API REST pensada para partners: `GET /api/v1/persons` con autenticación `Authorization: Bearer <key>` y scopes de solo lectura (`persons:read`, `tips:read`, …), con una `key` por fuente. Nos encantaría **integrar sus reportes con atribución visible y enlace de vuelta** a cada ficha en su sitio (no buscamos apropiarnos del dato, sino darle más difusión y derivarles tráfico).

La ruta pública sin auth solo expone los 24 registros más recientes, así que **preferimos pedirles una API key de forma ordenada** en vez de forzar nada. Nuestro consumo sería **mínimo y respetuoso**: una sola lectura del listado cada ~30 min desde un backend serverless, con el `Bearer` en el header.

¿Les sería viable concedernos una **API key de lectura** (scope `persons:read`) para nuestro origen? Con gusto añadimos el crédito a "Venezuela Te Busca" y el enlace a la ficha original en cada resultado.

Gracias por construir esto — está ayudando a mucha gente.

Equipo de VenezuelaHelp
https://venezuelahelp.click

---

**Notas internas (no enviar):**

- Conector listo para activar en cuanto den la key: la forma del objeto persona (`/api/v1/persons`) es `{ id, firstName, lastName, age, gender, lastSeen, description, status (missing|found), photoUrl (relativa /media/photos/...), reporter, sources[] }`. Mapeo `rest`: `titulo = firstName+lastName` (o `externalIdFrom`), `texto = description/lastSeen/status`, `imageUrl = photoUrl` (resolver contra la base), `sourceUrl = /?person=<id>`. La key iría en `endpoint.headers.Authorization` (idealmente desde SSM, no en el código).
- **Hoy esta fuente NO es crítica**: `red-esperanza` ya es un espejo público (sin auth) de un dataset de desaparecidos muy grande (~33k), así que la cobertura de desaparecidos ya es alta sin esta key. Esta integración sumaría otra fuente para corroboración cruzada.

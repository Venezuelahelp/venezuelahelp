# Respuesta — ficha técnica de integración (The Empire)

**Para:** developer@theempire.tech (CC: contacto@theempire.tech)
**Asunto:** Re: Colaboración VenezuelaHelp — ficha técnica de integración

> Contexto: tras la solicitud inicial (`2026-06-27-solicitud-acceso-theempire.md`), The Empire
> respondió con apertura pero pidiendo una ficha breve (campos, almacenamiento, retención,
> visualización pública, actualizaciones/eliminaciones, límites de consumo y medidas
> anti-redistribución) para evaluar un acceso controlado de solo lectura. Esta es la respuesta.

---

Hola, equipo de The Empire:

Gracias por la apertura y por la rapidez. Nos parece muy razonable la revisión técnica y de privacidad previa — de hecho es justo el tipo de cuidado que esperábamos de ustedes dado lo sensible del dato. Abajo va la ficha que piden, punto por punto.

**1. Campos que consumiríamos.** Solo los necesarios para que una persona encuentre el reporte y llegue a ustedes: **nombre, edad, ubicación, fecha, descripción, foto (URL), estado y coordenadas (lat/lng)**. El campo de **contacto** preferimos **no almacenarlo ni mostrarlo**; en su lugar enlazamos de vuelta a la ficha original en su sitio para que el contacto ocurra en su plataforma. Si prefieren que excluyamos algún campo adicional, lo ajustamos.

**2. Cómo los almacenaríamos.** Backend serverless en AWS (cuenta privada, región us-east-1). Los reportes se guardan en una tabla DynamoDB con identidad estable por ítem (idempotente) y se publican en un único archivo JSON cacheado que sirve a la web y al bot. **No revendemos, no cedemos a terceros y no exponemos un endpoint/export de los datos crudos**: lo único público es la vista web y las respuestas del bot, siempre con atribución.

**3. Tiempo de retención.** La retención está **atada a la vigencia en su feed**: solo conservamos un reporte mientras siga apareciendo en su API. Cuando deja de venir (ver punto 5), lo purgamos. Como salvaguarda adicional aplicamos un TTL máximo, de modo que ningún dato sobreviva más allá de lo que ustedes publican.

**4. Visualización pública.** Web pública (mapa con agrupación de marcadores + lista paginada) y un bot de Telegram con búsqueda. **Cada ficha lleva atribución visible a desaparecidosterremotovenezuela.com y un botón "Ver original" que enlaza de vuelta a su sitio** — la intención es derivarles tráfico, no reemplazarlos. No generamos rankings, perfiles ni cruces que expongan a las personas fuera del contexto de búsqueda de su reporte.

**5. Actualizaciones y eliminaciones.** Resincronizamos contra su feed cada ~6 horas. Un cambio en el origen se refleja en el siguiente ciclo, y — esto es lo importante — **si un registro desaparece de su API (persona localizada, baja solicitada, retiro por ustedes), deja de mostrarse en nuestra web y bot en ≤6 horas**. Si además exponen un mecanismo de baja inmediata (p. ej. un flag de "eliminado" o un webhook), lo respetamos con prioridad. También podemos darles un canal directo para pedir la purga de un registro puntual.

**6. Límites de consumo.** Mínimos: **una sola lectura del listado cada ~6 horas** desde un backend (no por usuario ni por consulta del público — el tráfico de la gente pega a nuestra caché, nunca a su API). Aceptamos el rate-limit, la cuota o la ventana horaria que prefieran.

**7. Medidas contra redistribución fuera de contexto.** (a) No publicamos un export ni una API de los datos crudos; (b) omitimos el dato de contacto y enlazamos a su ficha; (c) atribución y enlace de vuelta en cada reporte; (d) borrado propagado en ≤6 h; (e) acceso administrativo restringido; (f) uso estrictamente sin fines de lucro y limitado al evento del terremoto.

Con gusto firmamos cualquier acuerdo de uso de datos o nos ajustamos a las condiciones que definan. Si esta ficha les sirve, el siguiente paso por su parte sería el que les resulte más cómodo: API key de servidor, allowlist de nuestro origen, o un endpoint/export de solo lectura para agregadores.

Gracias de nuevo por construir esto y por la disposición a coordinar.

Un abrazo,
**Equipo VenezuelaHelp**

---

## Pendiente técnico si conceden acceso

- El compromiso de **borrado propagado en ≤6 h** (punto 5) implica que el scraper purgue ítems que ya
  no vienen en el feed. Hoy el scraper hace _upsert_ idempotente por `externalId`; **falta validar/implementar
  la sincronización completa por fuente** (tombstone o borrado de los `CAT#desaparecidos` cuyo
  `sourceId` es el de theempire y que no aparecieron en el último ciclo).
- Conector `jsonApi` nuevo + registro en `registry.ts`/`seed.ts` + test con fixture + deploy de
  `VenezuelaHelpScraperStack` (ver CLAUDE.md → fuente theempire bloqueada).

# PRODUCT.md — VenezuelaHelp Frontend Público

## Register

Sitio informativo público (brand-leaning informacional). El diseño sirve para que la gente encuentre rápido información de emergencia y llegue al bot de Telegram.

## Usuarios y propósito

- **Quién:** afectados por el terremoto de Venezuela, familiares buscando desaparecidos, voluntarios, donantes — la mayoría en **teléfonos**, posiblemente con conexión lenta y bajo estrés.
- **Trabajo a resolver:** ver de un vistazo la información agregada (reportes, desaparecidos, acopios, edificios dañados, solicitudes), filtrarla/buscarla, ubicarla en un mapa, y poder preguntar en lenguaje natural por Telegram.
- **Emoción objetivo:** confianza y calma. Nada alarmante ni saturado; claridad ante todo.

## Personalidad de marca

Serio, confiable, sobrio, humano. Como un portal oficial de emergencia bien hecho, pero cálido en el lenguaje (solidario, no burocrático).

## Anti-referencias

- No "dashboard SaaS" con tarjetas de métricas gigantes y gradientes.
- No estética alarmista de sirenas rojas por todos lados.
- No folclórico/saturado de bandera.
- No AI-slop (ver bans en DESIGN.md).

## Principios de diseño

1. **Legibilidad primero.** Alto contraste, tipografía clara, móvil primero.
2. **Velocidad.** Estático en CDN, datos de un solo `snapshot.json` cacheado. Carga rápida en redes lentas.
3. **Acción clara.** Un CTA dominante: preguntar al bot de Telegram.
4. **Honestidad del dato.** Mostrar fuente y marca de tiempo; nunca inventar.
5. **Accesibilidad.** AA de contraste, foco visible, navegable por teclado, `prefers-reduced-motion`.

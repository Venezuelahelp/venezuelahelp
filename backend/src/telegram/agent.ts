import {
  askBedrockToolRouter,
  askBedrock,
  type ToolSpec,
} from "@/telegram/bedrock";
import { retrieve } from "@/telegram/retrieval";
import {
  listItems,
  countItems,
  keywords,
  normalize,
  CAT_LABEL,
} from "@venezuelahelp/core";
import { formatList } from "@/telegram/format";
import { buildUserText } from "@/telegram/prompt";
import { buildMatchIndex, locatedNotice } from "@/telegram/locatedNotice";
import type { PublicItem, Snapshot } from "@/telegram/types";
import type { QaIntent } from "@/shared/types";

// Fallback que GUÍA en vez de cortar (patrón "Data Boundary" + tono de
// alo-ai-engine): cuando no hay datos para la consulta, orienta sobre qué sí
// puede responder, sin inventar. Compartido con el fallback RAG del handler.
export const NO_DATA_GUIDE =
  "No encontré información sobre eso. Puedo ayudarte a buscar una persona por su nombre, o a ver centros de acopio, refugios, hospitales y solicitudes de ayuda. ¿Qué necesitas? 🔎";

// Respuestas fijas (sin Bedrock) para saludo y rechazo de fuera-de-tema.
export const GREETING =
  "¡Hola! 👋 Soy el asistente de VenezuelaHelp. Te ayudo con información del terremoto de Venezuela (24 de junio de 2026): reportes, personas desaparecidas, centros de acopio, refugios, hospitales y solicitudes de ayuda. ¿Qué necesitas consultar?";
export const OFF_TOPIC =
  "Solo manejo información sobre el terremoto de Venezuela (reportes, desaparecidos, acopios, refugios, hospitales y solicitudes). No puedo ayudarte con eso. ¿Qué te gustaría consultar sobre el terremoto?";

const CATEGORIES = [
  "reportes",
  "desaparecidos",
  "acopios",
  "edificios",
  "solicitudes",
  "hospitales",
];

// Las 3 herramientas que el agente puede elegir para responder sobre el JSON.
const TOOLS: ToolSpec[] = [
  {
    name: "listar",
    description:
      "Lista ítems de una categoría (nombres, los últimos N, todos los de una zona). Úsalo cuando el usuario pida una LISTA o enumeración, p. ej. 'lista los 20 últimos reportados' o 'dame los nombres de los desaparecidos'.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORIES },
        zona: {
          type: "string",
          description: "Ciudad/estado/zona para filtrar, si la pide.",
        },
        limite: { type: "number", description: "Cuántos listar (default 20)." },
      },
      required: ["category"],
    },
  },
  {
    name: "contar",
    description:
      "Cuenta el total real de ítems (de TODAS las fuentes) de una o todas las categorías, opcionalmente por zona. Úsalo para '¿cuántos…?', 'número', 'cantidad', 'total'.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORIES },
        zona: { type: "string" },
      },
    },
  },
  {
    name: "buscar",
    description:
      "Busca ítems relevantes por palabras clave para responder una pregunta concreta (p. ej. '¿dónde hay agua en Petare?'). Úsalo cuando NO sea una lista ni un conteo.",
    inputSchema: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description:
            "La consulta de búsqueda (palabras clave o la pregunta).",
        },
        category: { type: "string", enum: CATEGORIES },
      },
      required: ["consulta"],
    },
  },
  {
    name: "saludar",
    description:
      "El usuario solo saluda, se despide o agradece (p. ej. 'hola', 'buenas', 'gracias', 'cómo estás'). Sin una pregunta sobre datos.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "fuera_de_tema",
    description:
      "El mensaje NO trata sobre el terremoto de Venezuela ni sus datos (reportes, desaparecidos, acopios, refugios, hospitales, solicitudes), o es un insulto/spam/contenido no permitido. P. ej. 'cuéntame un chiste', 'quién ganó el partido', 'háblame de política'.",
    inputSchema: { type: "object", properties: {} },
  },
];

const ROUTER_SYSTEM =
  "Eres el enrutador del asistente de VenezuelaHelp (datos del terremoto de Venezuela). Elige la herramienta adecuada para el mensaje del usuario. 'listar' para enumeraciones/nombres/últimos N; 'contar' para cantidades/totales; 'buscar' para preguntas concretas sobre los datos; 'saludar' si solo saluda/agradece/se despide sin preguntar; 'fuera_de_tema' si el mensaje no trata del terremoto de Venezuela o es insulto/spam. No respondas texto, solo llama a una herramienta.";

export interface AgentDeps {
  routeTools: typeof askBedrockToolRouter;
  askBedrock: typeof askBedrock;
}

// kind clasifica la respuesta para que el handler aplique moderación:
// "saludo"/"respuesta" resetean strikes; "rechazado" (fuera de tema/no
// permitido) suma un strike.
export type AgentKind = "saludo" | "respuesta" | "rechazado";

export interface AgentResult {
  reply: string;
  kind: AgentKind;
  // "agent_<herramienta>"; fuera_de_tema → "agent_rechazado".
  intent: QaIntent;
  itemsUsed: string[];
  tokensIn: number;
  tokensOut: number;
}

function asObj(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Enruta la pregunta a una herramienta (1 llamada LLM) y la ejecuta sobre el
// snapshot completo. listar/contar se formatean sin LLM; buscar usa el RAG +
// una 2ª llamada para redactar. Lanza si el router falla (el handler degrada).
export async function answerWithTools(
  question: string,
  snap: Snapshot,
  config: { bedrockModelId: string; systemPrompt: string },
  deps: AgentDeps,
): Promise<AgentResult> {
  const route = await deps.routeTools(
    config.bedrockModelId,
    ROUTER_SYSTEM,
    question,
    TOOLS,
  );
  const args = asObj(route.input);
  const tokensIn = route.tokensIn;
  const tokensOut = route.tokensOut;

  if (route.name === "saludar") {
    return {
      reply: GREETING,
      kind: "saludo",
      intent: "agent_saludar",
      itemsUsed: [],
      tokensIn,
      tokensOut,
    };
  }

  if (route.name === "fuera_de_tema") {
    return {
      reply: OFF_TOPIC,
      kind: "rechazado",
      intent: "agent_rechazado",
      itemsUsed: [],
      tokensIn,
      tokensOut,
    };
  }

  if (route.name === "contar") {
    return {
      reply: countItems(snap, {
        category: str(args.category),
        zona: str(args.zona),
      }),
      kind: "respuesta",
      intent: "agent_contar",
      itemsUsed: [],
      tokensIn,
      tokensOut,
    };
  }

  if (route.name === "listar") {
    const zona = str(args.zona);
    const { category, total, page } = listItems(snap, {
      category: str(args.category),
      zona,
      limite: num(args.limite),
    });
    return {
      reply: formatList(category, total, page, zona),
      kind: "respuesta",
      intent: "agent_listar",
      itemsUsed: page.map((i) => key(i)),
      tokensIn,
      tokensOut,
    };
  }

  // buscar (y fallback de cualquier nombre inesperado): RAG + redacción.
  const consulta = str(args.consulta) ?? question;
  const cat = str(args.category);
  let items = retrieve(consulta, snap);
  if (cat) {
    const only = items.filter((i) => i.category === cat);
    if (only.length) items = only;
  }
  if (items.length === 0) {
    return {
      reply: NO_DATA_GUIDE,
      kind: "respuesta",
      intent: "agent_buscar",
      itemsUsed: [],
      tokensIn,
      tokensOut,
    };
  }
  // Búsqueda por nombre/entidad: si la consulta coincide con el TÍTULO de los
  // ítems recuperados (p. ej. el nombre de un desaparecido), la presentamos de
  // forma determinista. El modelo redactor barato (Nova Lite) rechaza estas
  // consultas de "solo un nombre" con "No tengo ese dato" aunque la ficha esté
  // en los datos.
  const named = nameMatches(consulta, items);
  if (named.length) {
    return {
      reply: withLocatedNotice(named, snap),
      kind: "respuesta",
      intent: "agent_buscar",
      itemsUsed: named.map((i) => key(i)),
      tokensIn,
      tokensOut,
    };
  }
  const ans = await deps.askBedrock(
    config.bedrockModelId,
    config.systemPrompt,
    buildUserText(question, items),
  );
  return {
    reply: ans.text.trim() || NO_DATA_GUIDE,
    kind: "respuesta",
    intent: "agent_buscar",
    itemsUsed: items.map((i) => key(i)),
    tokensIn: tokensIn + ans.tokensIn,
    tokensOut: tokensOut + ans.tokensOut,
  };
}

function key(i: PublicItem): string {
  return `${i.category}/${i.sourceId}#${i.externalId}`;
}

// Formatea las fichas halladas por nombre y anexa el aviso de posible
// localización (no afirma; dice si está corroborado por varias fuentes).
function withLocatedNotice(named: PublicItem[], snap: Snapshot): string {
  let reply = formatMatches(named);
  const idx = buildMatchIndex(snap.matches ?? []);
  for (const it of named) {
    const notice = locatedNotice(it.titulo, idx);
    if (notice) {
      reply += `\n\n${notice}`;
      break;
    }
  }
  return reply;
}

// Búsqueda determinista por nombre, reutilizable fuera del router (p. ej. el
// handler cuando ya pidió el nombre y el usuario lo respondió). Devuelve null si
// no hay coincidencia por título.
export function answerPersonSearch(
  consulta: string,
  snap: Snapshot,
): { reply: string; itemsUsed: string[] } | null {
  const items = retrieve(consulta, snap);
  if (items.length === 0) return null;
  const named = nameMatches(consulta, items);
  if (named.length === 0) return null;
  return {
    reply: withLocatedNotice(named, snap),
    itemsUsed: named.map((i) => key(i)),
  };
}

// Cuántas fichas presentar como máximo ante una búsqueda por nombre.
const MAX_NAME_MATCHES = 5;
const MATCH_TEXT_MAX = 280;

// Ítems cuya TÍTULO contiene TODAS las palabras buscables de la consulta: es una
// búsqueda por nombre/entidad, no una pregunta abierta. `items` ya viene
// rankeado por `retrieve`, así que el filtro preserva el orden de relevancia.
function nameMatches(consulta: string, items: PublicItem[]): PublicItem[] {
  const kws = keywords(consulta);
  if (kws.length === 0) return [];
  return items
    .filter((it) => {
      const t = normalize(it.titulo);
      return t !== "" && kws.every((kw) => t.includes(kw));
    })
    .slice(0, MAX_NAME_MATCHES);
}

function formatMatch(it: PublicItem): string {
  const lines = [`🔎 ${it.titulo} — ${CAT_LABEL[it.category] ?? it.category}`];
  const texto = (it.texto ?? "").replace(/\s+/g, " ").trim();
  if (texto) {
    lines.push(
      texto.length > MATCH_TEXT_MAX
        ? `${texto.slice(0, MATCH_TEXT_MAX).trimEnd()}…`
        : texto,
    );
  }
  if (it.ubicacion?.nombre) lines.push(`📍 ${it.ubicacion.nombre}`);
  if (it.status) lines.push(`Estado: ${it.status.replace(/_/g, " ")}`);
  lines.push(`Fuente: ${it.sourceId}`);
  if (it.sourceUrl) lines.push(`🔗 ${it.sourceUrl}`);
  return lines.join("\n");
}

function formatMatches(items: PublicItem[]): string {
  const head =
    items.length === 1
      ? "Encontré 1 coincidencia:"
      : `Encontré ${items.length} coincidencias:`;
  return `${head}\n\n${items.map(formatMatch).join("\n\n")}`;
}

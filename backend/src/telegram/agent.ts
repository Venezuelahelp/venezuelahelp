import {
  askBedrockToolRouter,
  askBedrock,
  type ToolSpec,
} from "@/telegram/bedrock";
import { retrieve } from "@/telegram/retrieval";
import { listItems, formatList, countItems } from "@/telegram/query";
import { buildUserText } from "@/telegram/prompt";
import type { PublicItem, Snapshot } from "@/telegram/types";

const NO_DATA = "No tengo ese dato.";

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
          description: "La consulta de búsqueda (palabras clave o la pregunta).",
        },
        category: { type: "string", enum: CATEGORIES },
      },
      required: ["consulta"],
    },
  },
];

const ROUTER_SYSTEM =
  "Eres el enrutador del asistente de VenezuelaHelp (datos del terremoto). Elige la herramienta adecuada para la pregunta del usuario y rellena sus argumentos. 'listar' para enumeraciones/nombres/últimos N; 'contar' para cantidades/totales; 'buscar' para preguntas concretas. No respondas texto, solo llama a una herramienta.";

export interface AgentDeps {
  routeTools: typeof askBedrockToolRouter;
  askBedrock: typeof askBedrock;
}

export interface AgentResult {
  reply: string;
  itemsUsed: string[];
  tokensIn: number;
  tokensOut: number;
}

function asObj(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
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

  if (route.name === "contar") {
    return {
      reply: countItems(snap, { category: str(args.category), zona: str(args.zona) }),
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
    return { reply: NO_DATA, itemsUsed: [], tokensIn, tokensOut };
  }
  const ans = await deps.askBedrock(
    config.bedrockModelId,
    config.systemPrompt,
    buildUserText(question, items),
  );
  return {
    reply: ans.text.trim() || NO_DATA,
    itemsUsed: items.map((i) => key(i)),
    tokensIn: tokensIn + ans.tokensIn,
    tokensOut: tokensOut + ans.tokensOut,
  };
}

function key(i: PublicItem): string {
  return `${i.category}/${i.sourceId}#${i.externalId}`;
}

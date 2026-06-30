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
          description:
            "La consulta de búsqueda (palabras clave o la pregunta).",
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

  if (route.name === "contar") {
    return {
      reply: countItems(snap, {
        category: str(args.category),
        zona: str(args.zona),
      }),
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
  // Búsqueda por nombre/entidad: si la consulta coincide con el TÍTULO de los
  // ítems recuperados (p. ej. el nombre de un desaparecido), la presentamos de
  // forma determinista. El modelo redactor barato (Nova Lite) rechaza estas
  // consultas de "solo un nombre" con "No tengo ese dato" aunque la ficha esté
  // en los datos.
  const named = nameMatches(consulta, items);
  if (named.length) {
    return {
      reply: formatMatches(named),
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
    reply: ans.text.trim() || NO_DATA,
    itemsUsed: items.map((i) => key(i)),
    tokensIn: tokensIn + ans.tokensIn,
    tokensOut: tokensOut + ans.tokensOut,
  };
}

function key(i: PublicItem): string {
  return `${i.category}/${i.sourceId}#${i.externalId}`;
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

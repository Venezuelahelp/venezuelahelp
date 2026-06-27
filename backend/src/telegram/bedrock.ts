import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ToolInputSchema,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

interface Deps {
  client: Pick<BedrockRuntimeClient, "send">;
}

export async function askBedrock(
  modelId: string,
  system: string,
  userText: string,
  // `maxTokens` por defecto 512 (respuestas del bot, cortas); la extracción de
  // ítems lo sube porque un array JSON con muchos ítems necesita más espacio o
  // se trunca a mitad y deja de ser JSON válido.
  deps?: Partial<Deps> & { maxTokens?: number },
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const br = (deps?.client as Deps["client"]) ?? client;
  const res = await br.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      inferenceConfig: { maxTokens: deps?.maxTokens ?? 512, temperature: 0.2 },
    }),
  );
  const text = res.output?.message?.content?.[0]?.text ?? "";
  return {
    text,
    tokensIn: res.usage?.inputTokens ?? 0,
    tokensOut: res.usage?.outputTokens ?? 0,
  };
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Igual que askBedrock pero fuerza al modelo a responder llamando a `tool`, de
// modo que el SDK devuelve `input` como objeto ya parseado según el esquema.
// Elimina la fragilidad de parsear JSON de texto libre (comillas sin escapar,
// truncado, prosa alrededor): la extracción de ítems lo necesita.
export async function askBedrockTool(
  modelId: string,
  system: string,
  userText: string,
  tool: ToolSpec,
  deps?: Partial<Deps> & { maxTokens?: number },
): Promise<{ input: unknown; tokensIn: number; tokensOut: number }> {
  const br = (deps?.client as Deps["client"]) ?? client;
  const res = await br.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      inferenceConfig: { maxTokens: deps?.maxTokens ?? 4096, temperature: 0 },
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: tool.name,
              description: tool.description,
              inputSchema: {
                json: tool.inputSchema,
              } as ToolInputSchema,
            },
          },
        ],
        toolChoice: { tool: { name: tool.name } },
      },
    }),
  );
  const content = res.output?.message?.content ?? [];
  const toolUse = content.find((c) => "toolUse" in c)?.toolUse;
  return {
    input: toolUse?.input ?? null,
    tokensIn: res.usage?.inputTokens ?? 0,
    tokensOut: res.usage?.outputTokens ?? 0,
  };
}

// Router de herramientas: el modelo recibe VARIAS tools y elige una (toolChoice
// "any" → siempre llama a alguna). Devuelve el nombre elegido + sus argumentos.
// Lo usa el agente para enrutar la pregunta a contar/listar/buscar.
export async function askBedrockToolRouter(
  modelId: string,
  system: string,
  userText: string,
  tools: ToolSpec[],
  deps?: Partial<Deps>,
): Promise<{
  name: string | null;
  input: unknown;
  tokensIn: number;
  tokensOut: number;
}> {
  const br = (deps?.client as Deps["client"]) ?? client;
  const res = await br.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      inferenceConfig: { maxTokens: 256, temperature: 0 },
      toolConfig: {
        tools: tools.map((t) => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: { json: t.inputSchema } as ToolInputSchema,
          },
        })),
        toolChoice: { any: {} },
      },
    }),
  );
  const content = res.output?.message?.content ?? [];
  const toolUse = content.find((c) => "toolUse" in c)?.toolUse;
  return {
    name: toolUse?.name ?? null,
    input: toolUse?.input ?? null,
    tokensIn: res.usage?.inputTokens ?? 0,
    tokensOut: res.usage?.outputTokens ?? 0,
  };
}

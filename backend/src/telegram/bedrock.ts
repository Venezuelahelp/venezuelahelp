import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({});

interface Deps {
  client: Pick<BedrockRuntimeClient, "send">;
}

export async function askBedrock(
  modelId: string,
  system: string,
  userText: string,
  deps?: Partial<Deps>,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const br = (deps?.client as Deps["client"]) ?? client;
  const res = await br.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: userText }] }],
      inferenceConfig: { maxTokens: 512, temperature: 0.2 },
    }),
  );
  const text = res.output?.message?.content?.[0]?.text ?? "";
  return {
    text,
    tokensIn: res.usage?.inputTokens ?? 0,
    tokensOut: res.usage?.outputTokens ?? 0,
  };
}

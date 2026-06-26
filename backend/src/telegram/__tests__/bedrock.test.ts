import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { askBedrock, askBedrockTool } from "@/telegram/bedrock";

const brMock = mockClient(BedrockRuntimeClient);
beforeEach(() => brMock.reset());

describe("askBedrock", () => {
  it("returns the text and token usage from Converse", async () => {
    brMock.on(ConverseCommand).resolves({
      output: {
        message: {
          role: "assistant",
          content: [{ text: "Hay acopio en Chacao." }],
        },
      },
      usage: { inputTokens: 120, outputTokens: 15 },
    });
    const r = await askBedrock("amazon.nova-lite-v1:0", "system", "user text");
    expect(r.text).toBe("Hay acopio en Chacao.");
    expect(r.tokensIn).toBe(120);
    expect(r.tokensOut).toBe(15);
    const input = brMock.commandCalls(ConverseCommand)[0].args[0].input;
    expect(input.modelId).toBe("amazon.nova-lite-v1:0");
  });

  it("defaults maxTokens to 512 but honours an override", async () => {
    brMock.on(ConverseCommand).resolves({
      output: { message: { role: "assistant", content: [{ text: "ok" }] } },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await askBedrock("amazon.nova-lite-v1:0", "system", "user");
    await askBedrock("amazon.nova-lite-v1:0", "system", "user", {
      maxTokens: 4096,
    });
    const calls = brMock.commandCalls(ConverseCommand);
    expect(calls[0].args[0].input.inferenceConfig?.maxTokens).toBe(512);
    expect(calls[1].args[0].input.inferenceConfig?.maxTokens).toBe(4096);
  });
});

describe("askBedrockTool", () => {
  const TOOL = {
    name: "registrar_items",
    description: "Registra ítems.",
    inputSchema: {
      type: "object",
      properties: { items: { type: "array" } },
      required: ["items"],
    },
  };

  it("forces the tool and returns the parsed toolUse input", async () => {
    brMock.on(ConverseCommand).resolves({
      output: {
        message: {
          role: "assistant",
          content: [
            {
              toolUse: {
                toolUseId: "t1",
                name: "registrar_items",
                input: { items: [{ category: "reportes", titulo: "x" }] },
              },
            },
          ],
        },
      },
      usage: { inputTokens: 50, outputTokens: 20 },
    });
    const r = await askBedrockTool("m", "system", "user", TOOL);
    expect(r.input).toEqual({ items: [{ category: "reportes", titulo: "x" }] });
    const input = brMock.commandCalls(ConverseCommand)[0].args[0].input;
    expect(input.toolConfig?.toolChoice).toEqual({
      tool: { name: "registrar_items" },
    });
    expect(input.inferenceConfig?.maxTokens).toBe(4096);
  });

  it("returns null input when the model emits no toolUse", async () => {
    brMock.on(ConverseCommand).resolves({
      output: { message: { role: "assistant", content: [{ text: "hmm" }] } },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const r = await askBedrockTool("m", "system", "user", TOOL);
    expect(r.input).toBeNull();
  });
});

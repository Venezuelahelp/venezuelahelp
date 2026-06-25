import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { askBedrock } from "@/telegram/bedrock";

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
});

import { describe, it, expect, vi } from "vitest";
import { ensureBotApiKey } from "@/data-api/botKey";

const PARAM = "/venezuelahelp/bot/data-api-key";

describe("ensureBotApiKey", () => {
  it("no hace nada si el parámetro ya existe", async () => {
    const ssm = {
      send: vi.fn().mockResolvedValue({ Parameter: { Value: "vh_live_x" } }),
    };
    const repo = { create: vi.fn() };
    const r = await ensureBotApiKey({
      ssm: ssm as never,
      apiKeyRepo: repo as never,
      now: "2026-06-30T00:00:00Z",
    });
    expect(r.created).toBe(false);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("crea la key y la guarda en SSM si falta", async () => {
    const notFound = Object.assign(new Error("nf"), {
      name: "ParameterNotFound",
    });
    const ssm = {
      send: vi
        .fn()
        .mockRejectedValueOnce(notFound) // GetParameter
        .mockResolvedValueOnce({}), // PutParameter
    };
    const repo = {
      create: vi.fn().mockResolvedValue({ rawKey: "vh_live_new", apiKey: {} }),
    };
    const r = await ensureBotApiKey({
      ssm: ssm as never,
      apiKeyRepo: repo as never,
      now: "2026-06-30T00:00:00Z",
    });
    expect(r.created).toBe(true);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ consumerName: "telegram-bot" }),
    );
    // El segundo send es el PutParameter con SecureString
    const putArg = ssm.send.mock.calls[1][0];
    expect(putArg.input.Name).toBe(PARAM);
    expect(putArg.input.Type).toBe("SecureString");
    expect(putArg.input.Value).toBe("vh_live_new");
    expect(putArg.input.Overwrite).toBe(false);
  });

  it("propaga errores que no son ParameterNotFound", async () => {
    const throttle = Object.assign(new Error("throttled"), {
      name: "ThrottlingException",
    });
    const ssm = { send: vi.fn().mockRejectedValue(throttle) };
    const repo = { create: vi.fn() };
    await expect(
      ensureBotApiKey({ ssm: ssm as never, apiKeyRepo: repo as never }),
    ).rejects.toThrow("throttled");
    expect(repo.create).not.toHaveBeenCalled();
  });
});

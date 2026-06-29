import { describe, it, expect } from "vitest";
import { getConnector } from "@/connectors/registry";

describe("getConnector", () => {
  it("resolves bespoke sources", () => {
    expect(getConnector("terremotovenezuela")?.id).toBe("terremotovenezuela");
    expect(getConnector("ninosvenezuela")?.id).toBe("ninosvenezuela");
    expect(getConnector("hospitalesvenezuela")?.id).toBe("hospitalesvenezuela");
  });
  it("sismovenezuela ya no está en el registry (migró a rest)", () => {
    expect(getConnector("sismovenezuela")).toBeUndefined();
  });
  it("returns undefined for unknown", () => {
    expect(getConnector("nope")).toBeUndefined();
  });
});

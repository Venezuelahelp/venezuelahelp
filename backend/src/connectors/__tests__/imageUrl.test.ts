import { describe, it, expect } from "vitest";
import { imageUrl } from "@/connectors/types";

describe("imageUrl helper", () => {
  const BASE = "https://terremotovenezuela.app";

  it("resolves a relative path against the source origin", () => {
    expect(imageUrl(BASE, "/api/reports/abc/photo")).toBe(
      "https://terremotovenezuela.app/api/reports/abc/photo",
    );
  });

  it("passes an already-absolute URL through unchanged", () => {
    const u = "https://scontent.cdninstagram.com/v/t51/730994761.jpg";
    expect(imageUrl(BASE, u)).toBe(u);
  });

  it("returns undefined for null, empty, or non-string input", () => {
    expect(imageUrl(BASE, null)).toBeUndefined();
    expect(imageUrl(BASE, undefined)).toBeUndefined();
    expect(imageUrl(BASE, "")).toBeUndefined();
    expect(imageUrl(BASE, "   ")).toBeUndefined();
  });

  it("rejects non-http(s) schemes (it ends up in an <img src>)", () => {
    expect(imageUrl(BASE, "javascript:alert(1)")).toBeUndefined();
    expect(imageUrl(BASE, "data:image/png;base64,AAAA")).toBeUndefined();
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  htmlToText,
  extractItems,
  runAiSource,
} from "@/connectors/aiConnector";
import type { Source } from "@/shared/types";

describe("htmlToText", () => {
  it("strips scripts, styles and tags and collapses whitespace", () => {
    const html =
      "<style>x{}</style><script>bad()</script><h1>Hola</h1>  <p>mundo</p>";
    expect(htmlToText(html)).toBe("Hola mundo");
  });
  it("truncates to maxChars", () => {
    expect(htmlToText("<p>" + "a".repeat(100) + "</p>", 10).length).toBe(10);
  });
});

const askOk = (json: string) => vi.fn(async () => ({ text: json }));

describe("extractItems", () => {
  it("parses a JSON array, validates with Zod and maps to NormalizedItem", async () => {
    const json = `Aquí está: [
      {"category":"acopios","titulo":"Centro Chacao","texto":"agua","ubicacion":{"nombre":"Chacao"}},
      {"category":"INVALID","titulo":"x","texto":"y"},
      {"category":"reportes","texto":"sin titulo"}
    ]`;
    const items = await extractItems("texto", "acopios", "m", "noticias", {
      askBedrock: askOk(json),
    });
    expect(items).toHaveLength(1); // los 2 inválidos (cat mala / sin titulo) se descartan
    expect(items[0]).toMatchObject({
      category: "acopios",
      sourceId: "noticias",
      titulo: "Centro Chacao",
    });
    expect(items[0].externalId.length).toBeGreaterThan(0);
  });
  it("returns [] when no JSON array is present", async () => {
    expect(
      await extractItems("t", undefined, "m", "s", {
        askBedrock: askOk("no hay nada"),
      }),
    ).toEqual([]);
  });
});

describe("runAiSource", () => {
  const src: Source = {
    id: "noticias",
    nombre: "N",
    url: "https://x/y",
    connector: "ai",
    enabled: true,
  };
  const html = "<p>contenido de noticias</p>";
  const itemsJson = '[{"category":"reportes","titulo":"t","texto":"x"}]';

  it("skips Bedrock when content unchanged and < 6h", async () => {
    const text = htmlToText(html);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(text).digest("hex");
    const askBedrock = vi.fn();
    const r = await runAiSource(
      { ...src, lastContentHash: hash, lastExtractAt: "2026-06-26T00:00:00Z" },
      "2026-06-26T01:00:00Z",
      "m",
      { fetchText: vi.fn(async () => html), askBedrock: askBedrock as any },
    );
    expect(r.skipped).toBe(true);
    expect(askBedrock).not.toHaveBeenCalled();
  });

  it("calls Bedrock when content changed", async () => {
    const r = await runAiSource(src, "2026-06-26T01:00:00Z", "m", {
      fetchText: vi.fn(async () => html),
      askBedrock: askOk(itemsJson),
    });
    expect(r.skipped).toBe(false);
    expect(r.items).toHaveLength(1);
    expect(r.nextHash.length).toBeGreaterThan(0);
    expect(r.nextExtractAt).toBe("2026-06-26T01:00:00Z");
  });
});

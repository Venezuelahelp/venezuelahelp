import { describe, it, expect, vi } from "vitest";
import { answerWithTools } from "@/telegram/agent";
import type { PublicItem, Snapshot } from "@/telegram/types";

function di(id: string, nombre: string): PublicItem {
  return {
    category: "desaparecidos",
    sourceId: "s",
    externalId: id,
    titulo: nombre,
    texto: "",
  } as PublicItem;
}

const snap = {
  generatedAt: "t",
  categories: {
    desaparecidos: [di("1", "Ana"), di("2", "Beto"), di("3", "Carla")],
    acopios: [
      {
        category: "acopios",
        sourceId: "s",
        externalId: "a1",
        titulo: "Acopio Chacao",
        texto: "agua potable",
      } as PublicItem,
    ],
    reportes: [],
  },
} as unknown as Snapshot;

const config = { bedrockModelId: "m", systemPrompt: "sys" };

function route(name: string, input: unknown) {
  return vi.fn(async () => ({ name, input, tokensIn: 1, tokensOut: 1 }));
}

describe("answerWithTools (agente sobre el JSON)", () => {
  it("listar → enumera sobre todo el snapshot sin llamar a askBedrock", async () => {
    const askBedrock = vi.fn();
    const r = await answerWithTools(
      "dame los nombres de los desaparecidos",
      snap,
      config,
      {
        routeTools: route("listar", { category: "desaparecidos" }),
        askBedrock,
      },
    );
    expect(askBedrock).not.toHaveBeenCalled();
    expect(r.reply).toContain("Ana");
    expect(r.reply).toContain("de 3");
    expect(r.itemsUsed.length).toBe(3);
  });

  it("contar → total agregado sin askBedrock", async () => {
    const askBedrock = vi.fn();
    const r = await answerWithTools("cuántos desaparecidos", snap, config, {
      routeTools: route("contar", { category: "desaparecidos" }),
      askBedrock,
    });
    expect(askBedrock).not.toHaveBeenCalled();
    expect(r.reply).toContain("3");
    expect(r.reply).toContain("personas desaparecidas");
  });

  it("buscar → RAG + redacción con askBedrock", async () => {
    const askBedrock = vi.fn(async () => ({
      text: "Hay agua en el Acopio Chacao.",
      tokensIn: 10,
      tokensOut: 5,
    }));
    const r = await answerWithTools("dónde hay agua", snap, config, {
      routeTools: route("buscar", { consulta: "agua" }),
      askBedrock,
    });
    expect(askBedrock).toHaveBeenCalledOnce();
    expect(r.reply).toContain("Acopio Chacao");
    expect(r.itemsUsed.length).toBeGreaterThan(0);
  });

  it("buscar por nombre exacto → presenta la ficha determinista sin askBedrock", async () => {
    // El modelo redactor barato rechaza las consultas de "solo un nombre" con
    // "No tengo ese dato" aunque la ficha esté en los datos. Una coincidencia
    // fuerte con el título se presenta sin LLM.
    const askBedrock = vi.fn();
    const r = await answerWithTools("Ana", snap, config, {
      routeTools: route("buscar", { consulta: "Ana" }),
      askBedrock,
    });
    expect(askBedrock).not.toHaveBeenCalled();
    expect(r.reply).toContain("Ana");
    expect(r.itemsUsed.length).toBeGreaterThan(0);
  });

  it("buscar nombre con varias palabras → solo el que matchea TODAS en el título", async () => {
    const askBedrock = vi.fn();
    const snap2 = {
      generatedAt: "t",
      categories: {
        desaparecidos: [
          di("1", "Caroley rada"),
          di("2", "Caroley perez"),
          di("3", "Juan rada"),
        ],
        reportes: [],
      },
    } as unknown as Snapshot;
    const r = await answerWithTools("Caroley rada", snap2, config, {
      routeTools: route("buscar", { consulta: "Caroley rada" }),
      askBedrock,
    });
    expect(askBedrock).not.toHaveBeenCalled();
    expect(r.reply).toContain("Caroley rada");
    expect(r.reply).not.toContain("Caroley perez");
    expect(r.reply).not.toContain("Juan rada");
  });

  it("buscar sin resultados → No tengo ese dato (sin askBedrock)", async () => {
    const askBedrock = vi.fn();
    const r = await answerWithTools("plutonio xyzzy", snap, config, {
      routeTools: route("buscar", { consulta: "plutonio xyzzy" }),
      askBedrock,
    });
    expect(askBedrock).not.toHaveBeenCalled();
    expect(r.reply).toMatch(/No tengo/i);
  });
});

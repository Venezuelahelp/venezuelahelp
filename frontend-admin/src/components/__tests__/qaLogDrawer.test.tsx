import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { QaLogDrawer } from "@/components/QaLogDrawer";
import type { QaLogEntry, TgUser } from "@/types";

const user: TgUser = {
  chatId: 7,
  username: "ana",
  nombre: "Ana P",
  firstSeenAt: "2026-06-01T00:00:00Z",
  lastSeenAt: "2026-07-01T00:00:00Z",
  msgCount: 9,
};

const logs: QaLogEntry[] = [
  {
    ts: "2026-07-02T00:00:00.000Z",
    pregunta: "¿dónde hay acopios?",
    respuesta: "Hay 3 acopios cerca de Caracas.",
    intent: "rag_retrieve",
    itemsUsados: ["acopios:a1"],
    tokensIn: 120,
    tokensOut: 80,
    modelo: "nova-lite",
    costoEstimado: 0.0001,
    flagged: false,
  },
];

describe("QaLogDrawer", () => {
  it("carga y muestra las interacciones del chat (con badge de intent)", async () => {
    const loadQa = vi.fn().mockResolvedValue(logs);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    expect(loadQa).toHaveBeenCalledWith(7);
    expect(await screen.findByText("¿dónde hay acopios?")).toBeInTheDocument();
    expect(screen.getByText("rag_retrieve")).toBeInTheDocument();
    expect(screen.getByText("nova-lite")).toBeInTheDocument();
  });

  it("muestra el vacío cuando no hay interacciones", async () => {
    const loadQa = vi.fn().mockResolvedValue([]);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    expect(
      await screen.findByText("Este usuario aún no tiene interacciones."),
    ).toBeInTheDocument();
  });

  it("muestra error si la carga falla", async () => {
    const loadQa = vi.fn().mockRejectedValue(new Error("500"));
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las interacciones.",
    );
  });

  it("trunca respuestas largas y las expande con «Ver más»", async () => {
    const larga = "x".repeat(300);
    const loadQa = vi
      .fn()
      .mockResolvedValue([{ ...logs[0], respuesta: larga }]);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={() => {}} />);
    const btn = await screen.findByRole("button", { name: "Ver más" });
    fireEvent.click(btn);
    expect(screen.getByText(larga)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver menos" }),
    ).toBeInTheDocument();
  });

  it("llama onClose al cerrar y recarga con «Actualizar»", async () => {
    const onClose = vi.fn();
    const loadQa = vi.fn().mockResolvedValue([]);
    render(<QaLogDrawer user={user} loadQa={loadQa} onClose={onClose} />);
    await screen.findByText("Este usuario aún no tiene interacciones.");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(loadQa).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

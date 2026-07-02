import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { Users } from "@/components/Users";
import type { TgUser } from "@/types";

const users: TgUser[] = [
  {
    chatId: 1,
    username: "ana",
    nombre: "Ana P",
    languageCode: "es",
    firstSeenAt: "2026-06-01T00:00:00Z",
    lastSeenAt: "2026-06-26T00:00:00Z",
    msgCount: 9,
  },
];

describe("Users", () => {
  it("renders a user row with name, username and message count", () => {
    render(<Users users={users} />);
    expect(screen.getByText("Ana P")).toBeInTheDocument();
    expect(screen.getByText("@ana")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("renders the language name (not the raw code) and table headers", () => {
    render(<Users users={users} />);
    expect(screen.getByText("Español")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Usuario" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Última vez" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no users", () => {
    render(<Users users={[]} />);
    expect(
      screen.getByText("Aún no hay usuarios registrados."),
    ).toBeInTheDocument();
  });

  it("calls onRefresh when the refresh button is clicked", () => {
    const onRefresh = vi.fn();
    render(<Users users={users} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("abre el drawer de Q&A al hacer click en una fila", async () => {
    const onLoadQa = vi.fn().mockResolvedValue([]);
    render(<Users users={users} onLoadQa={onLoadQa} />);
    fireEvent.click(screen.getByText("Ana P"));
    expect(onLoadQa).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("cierra el drawer con su botón Cerrar", async () => {
    const onLoadQa = vi.fn().mockResolvedValue([]);
    render(<Users users={users} onLoadQa={onLoadQa} />);
    fireEvent.click(screen.getByText("Ana P"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el botón de bloqueo NO abre el drawer (stopPropagation)", () => {
    const onLoadQa = vi.fn().mockResolvedValue([]);
    const onToggleBlock = vi.fn();
    render(
      <Users users={users} onLoadQa={onLoadQa} onToggleBlock={onToggleBlock} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(onToggleBlock).toHaveBeenCalledOnce();
    expect(onLoadQa).not.toHaveBeenCalled();
  });
});

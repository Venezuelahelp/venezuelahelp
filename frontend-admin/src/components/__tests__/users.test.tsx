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
});

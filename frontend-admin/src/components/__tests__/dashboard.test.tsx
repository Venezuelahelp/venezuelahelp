import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { Dashboard } from "@/components/Dashboard";
import type { Stats } from "@/types";

const mockStats: Stats = {
  counts: {
    reportes: 10,
    desaparecidos: 5,
    acopios: 3,
    edificios: 7,
    solicitudes: 2,
  },
  sources: [
    {
      id: "src-1",
      nombre: "Fuente Alpha",
      enabled: true,
      lastRun: "2024-01-15T10:00:00Z",
      lastStatus: "ok",
    },
    {
      id: "src-2",
      nombre: "Fuente Beta",
      enabled: false,
      lastStatus: "error",
    },
    {
      id: "src-3",
      nombre: "Fuente Gamma",
      enabled: true,
    },
  ],
};

describe("Dashboard", () => {
  it("renders all category labels", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByText("Desaparecidos")).toBeInTheDocument();
    expect(screen.getByText("Acopios")).toBeInTheDocument();
    expect(screen.getByText("Edificios")).toBeInTheDocument();
    expect(screen.getByText("Solicitudes")).toBeInTheDocument();
  });

  it("renders the count for each category", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders per-source status section with source names", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.getByText("Fuente Alpha")).toBeInTheDocument();
    expect(screen.getByText("Fuente Beta")).toBeInTheDocument();
    expect(screen.getByText("Fuente Gamma")).toBeInTheDocument();
  });

  it("shows ok status for sources with lastStatus ok", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("shows error status for sources with lastStatus error", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("shows — for sources without lastStatus", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows nunca for sources without lastRun", () => {
    render(<Dashboard stats={mockStats} />);
    // src-2 and src-3 both have no lastRun → two "nunca" cells
    expect(screen.getAllByText("nunca")).toHaveLength(2);
  });

  it("calls onRefresh when the refresh button is clicked", () => {
    const onRefresh = vi.fn();
    render(<Dashboard stats={mockStats} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("disables the refresh button and shows progress while refreshing", () => {
    render(<Dashboard stats={mockStats} onRefresh={vi.fn()} refreshing />);
    const btn = screen.getByRole("button", { name: "Actualizando…" });
    expect(btn).toBeDisabled();
  });

  it("renders no refresh button when onRefresh is not provided", () => {
    render(<Dashboard stats={mockStats} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

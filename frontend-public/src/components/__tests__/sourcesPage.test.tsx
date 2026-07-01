import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SourcesPage from "@/components/SourcesPage";
import type { SourceInfo } from "@/types";

const dir: Record<string, SourceInfo> = {
  a: { nombre: "Fuente A", url: "https://fuentea.com/" },
};

describe("SourcesPage", () => {
  it("renderiza título, intervalo, fecha de actualización y las tarjetas de fuentes", () => {
    render(
      <SourcesPage
        sources={[{ sourceId: "a", count: 10, cats: ["reportes"] }]}
        sourceDir={dir}
        generatedAt="2026-07-01T01:17:46.000Z"
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Fuentes monitoreadas/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cada ~30 min/i)).toBeInTheDocument();
    expect(screen.getByText(/Datos actualizados:/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Fuente A/ });
    expect(link).toHaveAttribute("href", "https://fuentea.com/");
    expect(screen.getByText("https://fuentea.com/")).toBeInTheDocument();
  });
});

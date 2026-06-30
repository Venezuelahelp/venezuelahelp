import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LocatedMatches from "@/components/LocatedMatches";
import type { LocatedMatch } from "@/types";

const base: LocatedMatch = {
  nombre: "Juan Perez Lopez",
  signal: "nombre-fuerte",
  locatedSourcesCount: 1,
  missing: { sourceId: "A", texto: "buscado" },
  located: { sourceId: "B", texto: "encontrado", sources: ["B"] },
};

describe("LocatedMatches", () => {
  it("no renderiza nada si matches está vacío", () => {
    const { container } = render(<LocatedMatches matches={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it("muestra el copy de 'no es confirmación'", () => {
    render(<LocatedMatches matches={[base]} />);
    expect(screen.getByText(/No son confirmaciones/i)).toBeInTheDocument();
  });
  it("etiqueta corroborada cuando hay ≥2 fuentes", () => {
    render(<LocatedMatches matches={[{ ...base, locatedSourcesCount: 3 }]} />);
    expect(screen.getByText(/corroborada por 3 fuentes/i)).toBeInTheDocument();
  });
});

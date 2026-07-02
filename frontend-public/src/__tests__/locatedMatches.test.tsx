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

  describe("filtrado por nombre (#53)", () => {
    const ana: LocatedMatch = { ...base, nombre: "Ana Castillo Ramos" };
    const juan: LocatedMatch = { ...base, nombre: "Juan Perez Lopez" };

    it("query vacío muestra todos los matches", () => {
      render(<LocatedMatches matches={[ana, juan]} query="" />);
      expect(screen.getByText("Ana Castillo Ramos")).toBeInTheDocument();
      expect(screen.getByText("Juan Perez Lopez")).toBeInTheDocument();
    });

    it("filtra por nombre (acento/mayúsculas indiferentes)", () => {
      render(<LocatedMatches matches={[ana, juan]} query="JUÁN" />);
      expect(screen.getByText("Juan Perez Lopez")).toBeInTheDocument();
      expect(screen.queryByText("Ana Castillo Ramos")).toBeNull();
    });

    it("el orden de los tokens es indiferente", () => {
      render(<LocatedMatches matches={[ana, juan]} query="castillo ana" />);
      expect(screen.getByText("Ana Castillo Ramos")).toBeInTheDocument();
      expect(screen.queryByText("Juan Perez Lopez")).toBeNull();
    });

    it("sin coincidencias muestra un aviso (no oculta la sección entera)", () => {
      render(<LocatedMatches matches={[ana, juan]} query="zzzz" />);
      expect(screen.queryByText("Ana Castillo Ramos")).toBeNull();
      expect(screen.queryByText("Juan Perez Lopez")).toBeNull();
      // La sección sigue viva (título + aviso de sin resultados).
      expect(
        screen.getByRole("region", { name: /posibles localizaciones/i }),
      ).toBeInTheDocument();
    });
  });
});

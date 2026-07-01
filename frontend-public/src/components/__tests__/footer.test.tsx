import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer from "@/components/Footer";

describe("Footer", () => {
  it("muestra contacto, enlace al API y disclaimer (sin la lista de fuentes)", () => {
    render(<Footer />);
    // La lista de fuentes se movió a la página #/fuentes: el footer ya no la trae.
    expect(screen.queryByText(/cada ~30 min/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /quieres colaborar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Solicita acceso a nuestro API/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No es una fuente oficial/i)).toBeInTheDocument();
  });
});

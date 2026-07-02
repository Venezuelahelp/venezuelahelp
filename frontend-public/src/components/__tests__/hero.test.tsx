// src/components/__tests__/hero.test.tsx
import { render, screen } from "@testing-library/react";
import Hero from "@/components/Hero";
import type { Category } from "@/types";

// Suman 6 = total; ninguna categoría vale 3 (sourceCount) para no colisionar.
const COUNTS: Record<Category, number> = {
  reportes: 4,
  desaparecidos: 1,
  acopios: 1,
  edificios: 0,
  solicitudes: 0,
  hospitales: 0,
};

describe("Hero", () => {
  it("renders the editorial headline", () => {
    render(
      <Hero total={6} counts={COUNTS} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /terremoto/i }),
    ).toBeInTheDocument();
  });

  it("links to the Telegram bot safely", () => {
    render(
      <Hero total={6} counts={COUNTS} generatedAt="2026-06-26T18:00:00Z" />,
    );
    const link = screen.getByRole("link", { name: /telegram/i });
    expect(link).toHaveAttribute("href", "https://t.me/VenezuelaHelpInfoBot");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the total and last-update date in the summary panel", () => {
    render(
      <Hero total={6} counts={COUNTS} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("renders a per-category breakdown in the summary panel", () => {
    render(
      <Hero total={6} counts={COUNTS} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(screen.getByLabelText(/resumen por categoría/i)).toBeInTheDocument();
    expect(screen.getByText("Reportes")).toBeInTheDocument();
    expect(screen.getByText("Edificios dañados")).toBeInTheDocument();
  });

  it("omits the date gracefully when generatedAt is missing", () => {
    expect(() => render(<Hero total={0} counts={COUNTS} />)).not.toThrow();
  });

  describe("desglose de desaparecidos (#50/#54)", () => {
    const DESAP_COUNTS: Record<Category, number> = {
      ...COUNTS,
      desaparecidos: 10,
    };

    it("muestra los localizados y usa los pendientes como conteo prominente", () => {
      render(
        <Hero
          total={16}
          counts={DESAP_COUNTS}
          desaparecidosStatus={{ buscando: 7, localizado: 3 }}
        />,
      );
      // "N localizados" como sub-dato de contexto.
      expect(screen.getByText(/3 localizados/i)).toBeInTheDocument();
      // El conteo prominente de desaparecidos = pendientes (en búsqueda), no el total.
      const row = screen.getByText("Desaparecidos").closest("li")!;
      expect(row).toHaveTextContent("7");
    });

    it("feature-detect: sin statusClass (0/0) NO muestra desglose, cae al total", () => {
      render(
        <Hero
          total={16}
          counts={DESAP_COUNTS}
          desaparecidosStatus={{ buscando: 0, localizado: 0 }}
        />,
      );
      expect(screen.queryByText(/localizados/i)).toBeNull();
      const row = screen.getByText("Desaparecidos").closest("li")!;
      expect(row).toHaveTextContent("10");
    });

    it("sin la prop desaparecidosStatus se comporta como antes (solo total)", () => {
      render(<Hero total={16} counts={DESAP_COUNTS} />);
      expect(screen.queryByText(/localizados/i)).toBeNull();
      const row = screen.getByText("Desaparecidos").closest("li")!;
      expect(row).toHaveTextContent("10");
    });
  });
});

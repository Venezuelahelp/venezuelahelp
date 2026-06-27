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
    expect(() =>
      render(<Hero total={0} counts={COUNTS} />),
    ).not.toThrow();
  });
});

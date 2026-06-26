// src/components/__tests__/hero.test.tsx
import { render, screen } from "@testing-library/react";
import Hero from "@/components/Hero";

describe("Hero", () => {
  it("renders the editorial headline", () => {
    render(
      <Hero total={6} sourceCount={3} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /terremoto/i }),
    ).toBeInTheDocument();
  });

  it("links to the Telegram bot safely", () => {
    render(
      <Hero total={6} sourceCount={3} generatedAt="2026-06-26T18:00:00Z" />,
    );
    const link = screen.getByRole("link", { name: /telegram/i });
    expect(link).toHaveAttribute("href", "https://t.me/VenezuelaHelpInfoBot");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the record count, source count and date in the meta line", () => {
    render(
      <Hero total={6} sourceCount={3} generatedAt="2026-06-26T18:00:00Z" />,
    );
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("omits the date gracefully when generatedAt is missing", () => {
    expect(() => render(<Hero total={0} sourceCount={0} />)).not.toThrow();
  });
});

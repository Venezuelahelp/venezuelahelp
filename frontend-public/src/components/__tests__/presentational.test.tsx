import { render, screen } from "@testing-library/react";
import Badge from "@/components/Badge";
import Header from "@/components/Header";
import Hero from "@/components/Hero";

const TELEGRAM_URL = "https://t.me/VenezuelaHelpInfoBot";

// --------------- Badge ---------------

describe("Badge", () => {
  it("renders the label for 'reportes'", () => {
    render(<Badge category="reportes" />);
    expect(screen.getByText("Reportes")).toBeInTheDocument();
  });

  it("renders the label for 'desaparecidos'", () => {
    render(<Badge category="desaparecidos" />);
    expect(screen.getByText("Desaparecidos")).toBeInTheDocument();
  });

  it("renders the label for 'edificios'", () => {
    render(<Badge category="edificios" />);
    expect(screen.getByText("Edificios dañados")).toBeInTheDocument();
  });
});

// --------------- Header ---------------

describe("Header", () => {
  it("renders the wordmark 'VenezuelaHelp'", () => {
    render(<Header />);
    expect(screen.getByText(/VenezuelaHelp/i)).toBeInTheDocument();
  });

  it("renders a link to the Telegram bot with accessible name containing 'telegram'", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /telegram/i });
    expect(link).toHaveAttribute("href", TELEGRAM_URL);
  });

  it("Telegram link opens in a new tab safely", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /telegram/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

// --------------- Hero ---------------

describe("Hero", () => {
  const generatedAt = "2025-07-15T10:30:00Z";

  it("renders an h1 heading", () => {
    render(<Hero generatedAt={generatedAt} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders the formatted 'Datos actualizados' line with a valid date", () => {
    render(<Hero generatedAt={generatedAt} />);
    // Should contain "Datos actualizados:" followed by something
    expect(screen.getByText(/Datos actualizados:/)).toBeInTheDocument();
  });

  it("includes the formatted date in es-VE locale", () => {
    render(<Hero generatedAt={generatedAt} />);
    // The date should be formatted — we check that the year appears
    const el = screen.getByText(/Datos actualizados:/);
    expect(el.textContent).toMatch(/2025/);
  });

  it("renders a CTA link to Telegram", () => {
    render(<Hero generatedAt={generatedAt} />);
    // There may be multiple telegram links; we just need at least one
    const links = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href") === TELEGRAM_URL);
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("handles an invalid date gracefully without throwing", () => {
    expect(() => render(<Hero generatedAt="not-a-date" />)).not.toThrow();
  });
});

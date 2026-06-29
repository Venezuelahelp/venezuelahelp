import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Source from "@/components/Source";

describe("Source", () => {
  it("enlaza al permalink del ítem cuando hay sourceUrl", () => {
    render(
      <Source sourceId="sismovenezuela" sourceUrl="https://tiktok.com/x" />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://tiktok.com/x");
    expect(link).toHaveTextContent(/ver original/i);
  });

  it("cae a la home de la fuente cuando no hay sourceUrl", () => {
    render(<Source sourceId="sismovenezuela" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://www.sismovenezuela.com");
    expect(link).toHaveTextContent(/fuente/i);
  });

  it("sin enlace cuando la fuente no tiene url ni permalink", () => {
    render(<Source sourceId="fuente-desconocida-xyz" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SourceGrid from "@/components/SourceGrid";
import { SourcesContext } from "@/data/sources";
import type { SourceInfo } from "@/types";

const dir: Record<string, SourceInfo> = {
  a: { nombre: "Fuente A", url: "https://fuentea.com/" },
  b: { nombre: "Fuente B", url: "https://fuenteb.org/" },
};

function renderGrid(
  sources: {
    sourceId: string;
    count: number;
    cats: import("@/types").Category[];
  }[],
) {
  return render(
    <SourcesContext.Provider value={dir}>
      <SourceGrid sources={sources} />
    </SourcesContext.Provider>,
  );
}

describe("SourceGrid", () => {
  it("renders a linked card per source with the full URL and formatted count", () => {
    renderGrid([{ sourceId: "a", count: 1234, cats: ["reportes"] }]);
    const link = screen.getByRole("link", { name: /Fuente A/ });
    expect(link).toHaveAttribute("href", "https://fuentea.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("https://fuentea.com/")).toBeInTheDocument();
    const expectedCount = new Intl.NumberFormat("es").format(1234);
    expect(screen.getByText(expectedCount)).toBeInTheDocument();
  });

  it("uses the google favicon service with the source domain", () => {
    const { container } = renderGrid([{ sourceId: "a", count: 1, cats: [] }]);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain(
      "google.com/s2/favicons?domain=fuentea.com",
    );
    expect(img).toHaveAttribute("alt", "");
  });

  it("shows up to 3 category chips and +N for the rest", () => {
    renderGrid([
      {
        sourceId: "a",
        count: 5,
        cats: [
          "desaparecidos",
          "edificios",
          "acopios",
          "reportes",
          "solicitudes",
        ],
      },
    ]);
    expect(screen.getByText("Desaparecidos")).toBeInTheDocument();
    expect(screen.getByText("Edificios")).toBeInTheDocument();
    expect(screen.getByText("Acopios")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("Reportes")).not.toBeInTheDocument();
  });
});

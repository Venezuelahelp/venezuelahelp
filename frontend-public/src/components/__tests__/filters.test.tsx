import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterBar from "@/components/FilterBar";
import { CATEGORY_META, FILTER_CATEGORY_ORDER } from "@/data/categories";
import type { Category } from "@/types";

const counts: Record<Category, number> = {
  reportes: 10,
  desaparecidos: 5,
  acopios: 8,
  edificios: 3,
  solicitudes: 7,
  hospitales: 0,
};

const TOTAL = Object.values(counts).reduce((a, b) => a + b, 0);

type Overrides = Partial<React.ComponentProps<typeof FilterBar>>;

function renderBar(overrides: Overrides = {}) {
  const props = {
    query: "",
    onQuery: () => {},
    active: new Set<Category>(),
    onToggle: () => {},
    counts,
    resultCount: TOTAL,
    total: TOTAL,
    onClear: () => {},
    matchActive: false,
    onToggleMatch: () => {},
    matchCount: 0,
    ...overrides,
  };
  return render(<FilterBar {...props} />);
}

// --------------- FilterBar ---------------

describe("FilterBar", () => {
  it("renders a search input with aria-label 'Buscar'", () => {
    renderBar();
    expect(
      screen.getByRole("searchbox", { name: "Buscar" }),
    ).toBeInTheDocument();
  });

  it("calls onQuery when the user types in the search input", async () => {
    const onQuery = vi.fn();
    const user = userEvent.setup();
    renderBar({ onQuery });
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    await user.type(input, "r");
    expect(onQuery).toHaveBeenCalledWith("r");
  });

  it("renders a chip button for every category in FILTER_CATEGORY_ORDER", () => {
    renderBar();
    for (const cat of FILTER_CATEGORY_ORDER) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(CATEGORY_META[cat].label, "i"),
        }),
      ).toBeInTheDocument();
    }
  });

  it("does not offer 'reportes' as a filter option (#51)", () => {
    renderBar();
    expect(FILTER_CATEGORY_ORDER).not.toContain("reportes");
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^${CATEGORY_META["reportes"].label}`, "i"),
      }),
    ).not.toBeInTheDocument();
  });

  it("each category chip shows its count", () => {
    renderBar();
    const acopiosBtn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["acopios"].label, "i"),
    });
    expect(acopiosBtn).toHaveTextContent("8");
  });

  it("clicking a category chip calls onToggle with that category", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderBar({ onToggle });
    const btn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["acopios"].label, "i"),
    });
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledWith("acopios");
  });

  it("inactive chip has aria-pressed='false'", () => {
    renderBar();
    const btn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["acopios"].label, "i"),
    });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("active chip has aria-pressed='true'", () => {
    renderBar({ active: new Set<Category>(["acopios"]) });
    const btn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["acopios"].label, "i"),
    });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the total result count when no filters are active", () => {
    renderBar({ resultCount: TOTAL, total: TOTAL });
    expect(screen.getByText(/resultados/i)).toHaveTextContent(
      `${TOTAL} resultados`,
    );
  });

  it("shows a 'Limpiar filtros' button and X de Y count when filtering", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    renderBar({
      query: "agua",
      resultCount: 4,
      total: TOTAL,
      onClear,
    });
    expect(screen.getByText(`de ${TOTAL} resultados`)).toBeInTheDocument();
    const clear = screen.getByRole("button", { name: /limpiar filtros/i });
    await user.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("does not show 'Limpiar filtros' when no filters are active", () => {
    renderBar();
    expect(
      screen.queryByRole("button", { name: /limpiar filtros/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a 'Match' chip with its count", () => {
    renderBar({ matchCount: 294 });
    const btn = screen.getByRole("button", { name: /match/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("294");
  });

  it("clicking the Match chip calls onToggleMatch", async () => {
    const onToggleMatch = vi.fn();
    const user = userEvent.setup();
    renderBar({ onToggleMatch, matchCount: 5 });
    await user.click(screen.getByRole("button", { name: /match/i }));
    expect(onToggleMatch).toHaveBeenCalledTimes(1);
  });

  it("shows 'N posibles localizaciones' when Match is active", () => {
    renderBar({ matchActive: true, matchCount: 294 });
    expect(screen.getByText(/posibles localizaciones/i)).toHaveTextContent(
      "294 posibles localizaciones",
    );
  });
});

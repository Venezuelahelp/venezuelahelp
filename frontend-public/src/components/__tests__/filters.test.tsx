import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterBar from "@/components/FilterBar";
import { CATEGORY_META, CATEGORY_ORDER } from "@/data/categories";
import type { Category } from "@/types";

const counts: Record<Category, number> = {
  reportes: 10,
  desaparecidos: 5,
  acopios: 8,
  edificios: 3,
  solicitudes: 7,
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

  it("renders a chip button for every category in CATEGORY_ORDER", () => {
    renderBar();
    for (const cat of CATEGORY_ORDER) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(CATEGORY_META[cat].label, "i"),
        }),
      ).toBeInTheDocument();
    }
  });

  it("each category chip shows its count", () => {
    renderBar();
    const reportesBtn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["reportes"].label, "i"),
    });
    expect(reportesBtn).toHaveTextContent("10");
  });

  it("clicking a category chip calls onToggle with that category", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderBar({ onToggle });
    const btn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["reportes"].label, "i"),
    });
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledWith("reportes");
  });

  it("inactive chip has aria-pressed='false'", () => {
    renderBar();
    const btn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["reportes"].label, "i"),
    });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("active chip has aria-pressed='true'", () => {
    renderBar({ active: new Set<Category>(["reportes"]) });
    const btn = screen.getByRole("button", {
      name: new RegExp(CATEGORY_META["reportes"].label, "i"),
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
});

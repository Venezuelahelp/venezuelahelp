import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemList from "@/components/ItemList";
import { Empty, ErrorState, Loading } from "@/components/States";
import type { Item } from "@/types";

// --------------- fixtures ---------------

const items: Item[] = [
  {
    category: "reportes",
    sourceId: "tg",
    externalId: "101",
    titulo: "Edificio colapsado en El Silencio",
    texto: "Reporte de estructura dañada en la zona central de Caracas.",
    ubicacion: { lat: 10.5, lng: -66.9, nombre: "El Silencio, Caracas" },
    firstSeenAt: "2026-06-26T12:00:00Z",
  },
  {
    category: "desaparecidos",
    sourceId: "wa",
    externalId: "202",
    titulo: "Busco a María Rodríguez",
    texto: "Última vez vista en Altamira el martes a las 3pm.",
  },
  {
    category: "acopios",
    sourceId: "ig",
    externalId: "303",
    titulo: "Centro de acopio en Las Mercedes",
    texto: "Reciben agua, medicamentos y ropa.",
    ubicacion: { lat: 10.48, lng: -66.85, nombre: "Las Mercedes" },
    firstSeenAt: "2026-06-25T09:00:00Z",
  },
];

// --------------- ItemList ---------------

describe("ItemList", () => {
  it("renders a list element", () => {
    render(<ItemList items={items} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("renders N list items matching the items array length", () => {
    render(<ItemList items={items} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(items.length);
  });

  it("renders the titulo of each item", () => {
    render(<ItemList items={items} />);
    for (const item of items) {
      expect(screen.getByText(item.titulo)).toBeInTheDocument();
    }
  });

  it("renders the sourceId of each item", () => {
    render(<ItemList items={items} />);
    for (const item of items) {
      expect(screen.getByText(item.sourceId)).toBeInTheDocument();
    }
  });

  it("renders ubicacion.nombre when present", () => {
    render(<ItemList items={items} />);
    expect(screen.getByText("El Silencio, Caracas")).toBeInTheDocument();
    expect(screen.getByText("Las Mercedes")).toBeInTheDocument();
  });

  it("does not crash when ubicacion is absent", () => {
    expect(() => render(<ItemList items={[items[1]]} />)).not.toThrow();
  });

  it("renders nothing but the list when items array is empty", () => {
    render(<ItemList items={[]} />);
    const list = screen.getByRole("list");
    expect(list).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows the formatted date for items with firstSeenAt", () => {
    render(<ItemList items={[items[0]]} />);
    // formatDateShort(2026-06-26) → "26 jun 2026" (es-VE)
    expect(screen.getByText(/jun.*2026/i)).toBeInTheDocument();
  });

  it("each row is a button that opens a detail dialog", async () => {
    const user = userEvent.setup();
    render(<ItemList items={items} />);

    // no dialog initially
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Edificio colapsado/i }),
    );

    const dialog = screen.getByRole("dialog");
    // full texto shown inside the modal
    expect(
      within(dialog).getByText(
        "Reporte de estructura dañada en la zona central de Caracas.",
      ),
    ).toBeInTheDocument();
    // "Registrado" date label present
    expect(within(dialog).getByText(/Registrado:/i)).toBeInTheDocument();
  });

  it("closes the detail dialog with the close button", async () => {
    const user = userEvent.setup();
    render(<ItemList items={items} />);

    await user.click(
      screen.getByRole("button", { name: /Edificio colapsado/i }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// --------------- Empty ---------------

describe("Empty", () => {
  it("renders 'No hay resultados' when no query", () => {
    render(<Empty />);
    expect(screen.getByText(/No hay resultados/i)).toBeInTheDocument();
  });

  it("mentions the query when provided", () => {
    render(<Empty query="terremoto" />);
    expect(screen.getByText(/terremoto/)).toBeInTheDocument();
  });

  it("renders the full message with query interpolated", () => {
    render(<Empty query="Mérida" />);
    const el = screen.getByText(/No hay resultados/i);
    expect(el.textContent).toMatch(/Mérida/);
  });
});

// --------------- ErrorState ---------------

describe("ErrorState", () => {
  it("renders the error message in Spanish", () => {
    render(<ErrorState onRetry={() => {}} />);
    expect(
      screen.getByText(/No pudimos cargar los datos/i),
    ).toBeInTheDocument();
  });

  it("renders a 'Reintentar' button", () => {
    render(<ErrorState onRetry={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Reintentar/i }),
    ).toBeInTheDocument();
  });

  it("calls onRetry when the Reintentar button is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /Reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// --------------- Loading ---------------

describe("Loading", () => {
  it("renders without crashing", () => {
    expect(() => render(<Loading />)).not.toThrow();
  });

  it("renders some placeholder content (skeleton rows)", () => {
    const { container } = render(<Loading />);
    // At least one child element should be present as a skeleton
    expect(container.firstChild).not.toBeNull();
  });
});

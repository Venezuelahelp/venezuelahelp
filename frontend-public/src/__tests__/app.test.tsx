import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, type MockedFunction } from "vitest";

// --------------- Mocks ---------------

// Mock leaflet + react-leaflet (same stubs as mapview.test.tsx)
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url }: { url: string }) => (
    <div data-testid="tile-layer" data-url={url} />
  ),
  CircleMarker: ({
    center,
    children,
    pathOptions,
  }: {
    center: [number, number];
    children?: React.ReactNode;
    pathOptions?: { color?: string };
  }) => (
    <div
      data-testid="marker"
      data-center={JSON.stringify(center)}
      data-color={pathOptions?.color ?? ""}
    >
      {children}
    </div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
}));

// Mock useSnapshot — we'll configure per-test via mockReturnValue
vi.mock("@/data/useSnapshot", () => ({
  useSnapshot: vi.fn(),
}));

// Analytics beacon is fire-and-forget; stub it so tests don't hit the network.
vi.mock("@/track", () => ({
  sendBeacon: () => {},
}));

import { useSnapshot } from "@/data/useSnapshot";
import App from "@/App";
import type { Snapshot } from "@/types";

const mockUseSnapshot = useSnapshot as MockedFunction<typeof useSnapshot>;

// --------------- Fixtures ---------------

const SNAPSHOT: Snapshot = {
  generatedAt: "2026-06-25T12:00:00Z",
  categories: {
    reportes: [
      {
        category: "reportes",
        sourceId: "src-1",
        externalId: "ext-1",
        titulo: "Edificio colapsado en Caracas",
        texto: "Reporte de colapso estructural.",
        ubicacion: { lat: 10.48, lng: -66.87, nombre: "Caracas" },
      },
    ],
    desaparecidos: [
      {
        category: "desaparecidos",
        sourceId: "src-2",
        externalId: "ext-2",
        titulo: "Persona desaparecida en Valencia",
        texto: "Búsqueda activa en zona norte.",
        ubicacion: { lat: 10.16, lng: -68.0, nombre: "Valencia" },
      },
    ],
    acopios: [],
    edificios: [],
    solicitudes: [],
    hospitales: [],
  },
};

// --------------- Tests ---------------

describe("App integration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state when loading=true", () => {
    mockUseSnapshot.mockReturnValue({ data: null, loading: true, error: null });
    render(<App />);
    // The Loading component renders with aria-busy
    expect(screen.getByLabelText("Cargando")).toBeInTheDocument();
  });

  it("shows ErrorState when error is set", () => {
    mockUseSnapshot.mockReturnValue({
      data: null,
      loading: false,
      error: "HTTP 500",
    });
    render(<App />);
    expect(
      screen.getByText(/No pudimos cargar los datos/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reintentar/i }),
    ).toBeInTheDocument();
  });

  it("renders item titles from snapshot data", () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);
    // titles appear in both the ItemList and the MapView popup — use getAllByText
    expect(
      screen.getAllByText("Edificio colapsado en Caracas").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Persona desaparecida en Valencia").length,
    ).toBeGreaterThan(0);
  });

  it("filters items when user types a query", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);

    const input = screen.getByRole("searchbox", { name: /buscar/i });
    await userEvent.type(input, "Caracas");

    await waitFor(() => {
      expect(
        screen.getAllByText("Edificio colapsado en Caracas").length,
      ).toBeGreaterThan(0);
    });

    // Valencia item should not be visible anywhere
    expect(
      screen.queryAllByText("Persona desaparecida en Valencia"),
    ).toHaveLength(0);
  });

  it("shows Empty when query matches nothing", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);

    const input = screen.getByRole("searchbox", { name: /buscar/i });
    await userEvent.type(input, "xyzzy-no-existe");

    await waitFor(() => {
      expect(screen.getByText(/No hay resultados para/i)).toBeInTheDocument();
    });
  });

  it("filters by category toggle — hides items outside toggled category", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);

    // Both items visible initially (each appears in list + map popup)
    expect(
      screen.getAllByText("Edificio colapsado en Caracas").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Persona desaparecida en Valencia").length,
    ).toBeGreaterThan(0);

    // Toggle "Reportes" chip in FilterBar (aria-pressed button)
    const chips = screen
      .getAllByRole("button", { name: /Reportes/i })
      .filter((btn) => btn.getAttribute("aria-pressed") !== null);
    // use the first chip found (FilterBar chip)
    await userEvent.click(chips[0]);

    await waitFor(() => {
      expect(
        screen.getAllByText("Edificio colapsado en Caracas").length,
      ).toBeGreaterThan(0);
    });

    // Valencia (desaparecidos) should be gone everywhere
    expect(
      screen.queryAllByText("Persona desaparecida en Valencia"),
    ).toHaveLength(0);
  });

  it("always shows the Header with wordmark", () => {
    mockUseSnapshot.mockReturnValue({ data: null, loading: true, error: null });
    render(<App />);
    expect(
      screen.getByRole("link", { name: /Venezuela\s*Help/i }),
    ).toBeInTheDocument();
  });

  it("shows generatedAt date in Hero when data loads", () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);
    // Hero renders "Última actualización · ..." with a formatted date
    expect(screen.getByText(/Última actualización/i)).toBeInTheDocument();
  });

  const SNAPSHOT_STATUS: Snapshot = {
    ...SNAPSHOT,
    categories: {
      ...SNAPSHOT.categories,
      desaparecidos: [
        {
          ...SNAPSHOT.categories.desaparecidos[0],
          statusClass: "buscando",
        },
        {
          category: "desaparecidos",
          sourceId: "src-2",
          externalId: "ext-9",
          titulo: "Pedro Gomez localizado",
          texto: "Reportado a salvo en Caracas.",
          statusClass: "localizado",
        },
      ],
    },
  };

  // Chips de categoría = botones con aria-pressed (los badges de la lista son spans).
  function desaparecidosChips() {
    return screen
      .getAllByRole("button", { name: /Desaparecidos/i })
      .filter((btn) => btn.getAttribute("aria-pressed") !== null);
  }

  it("muestra el sub-filtro de status solo con desaparecidos activa", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT_STATUS,
      loading: false,
      error: null,
    });
    render(<App />);
    expect(screen.queryByRole("group", { name: /por estado/i })).toBeNull();

    await userEvent.click(desaparecidosChips()[0]);
    expect(
      screen.getAllByRole("group", { name: /por estado/i }).length,
    ).toBeGreaterThan(0);

    // Desactivar la categoría lo oculta de nuevo.
    await userEvent.click(desaparecidosChips()[0]);
    expect(screen.queryByRole("group", { name: /por estado/i })).toBeNull();
  });

  it("filtra por Localizados dentro de desaparecidos", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT_STATUS,
      loading: false,
      error: null,
    });
    render(<App />);
    await userEvent.click(desaparecidosChips()[0]);

    const group = screen.getAllByRole("group", { name: /por estado/i })[0];
    await userEvent.click(
      within(group).getByRole("button", { name: "Localizados" }),
    );

    await waitFor(() => {
      expect(
        screen.queryAllByText("Persona desaparecida en Valencia"),
      ).toHaveLength(0);
    });
    expect(
      screen.getAllByText("Pedro Gomez localizado").length,
    ).toBeGreaterThan(0);
  });

  it("feature-detect: snapshot sin statusClass no muestra el sub-filtro", async () => {
    mockUseSnapshot.mockReturnValue({
      data: SNAPSHOT,
      loading: false,
      error: null,
    });
    render(<App />);
    await userEvent.click(desaparecidosChips()[0]);
    expect(screen.queryByRole("group", { name: /por estado/i })).toBeNull();
  });
});

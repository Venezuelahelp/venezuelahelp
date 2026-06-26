import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { Item } from "@/types";

// --------------- react-leaflet mock ---------------
// jsdom cannot run real Leaflet (no canvas/SVG engine); we replace the
// react-leaflet primitives with lightweight stubs that expose the props
// we care about via data-* attributes.

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: ({ url }: { url: string }) => (
    <div data-testid="tile-layer" data-url={url} />
  ),
  Marker: ({
    position,
    children,
    icon,
  }: {
    position: [number, number];
    children?: React.ReactNode;
    icon?: { options?: { html?: string } };
  }) => (
    <div
      data-testid="marker"
      data-position={JSON.stringify(position)}
      data-icon-html={icon?.options?.html ?? ""}
    >
      {children}
    </div>
  ),
  CircleMarker: ({
    center,
    children,
  }: {
    center: [number, number];
    children?: React.ReactNode;
  }) => (
    <div data-testid="user-marker" data-center={JSON.stringify(center)}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
}));

// Cluster group is a pass-through wrapper in tests (renders its markers).
vi.mock("react-leaflet-cluster", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cluster">{children}</div>
  ),
}));

// Mock CSS imports (no-op in jsdom)
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.css", () => ({}));
vi.mock("leaflet.markercluster/dist/MarkerCluster.Default.css", () => ({}));

import MapView from "@/components/MapView";

// --------------- Fixtures ---------------

const itemWithLocation: Item = {
  category: "reportes",
  sourceId: "src-1",
  externalId: "ext-1",
  titulo: "Edificio colapsado en Caracas",
  texto: "Reporte de colapso estructural.",
  ubicacion: { lat: 10.48, lng: -66.87, nombre: "Caracas" },
};

const itemWithoutLocation: Item = {
  category: "acopios",
  sourceId: "src-2",
  externalId: "ext-2",
  titulo: "Acopio sin ubicación",
  texto: "No tiene coordenadas.",
};

const itemWithLocation2: Item = {
  category: "desaparecidos",
  sourceId: "src-3",
  externalId: "ext-3",
  titulo: "Persona desaparecida en Maracay",
  texto: "Búsqueda activa.",
  ubicacion: { lat: 10.24, lng: -67.59, nombre: "Maracay" },
};

// --------------- Tests ---------------

describe("MapView", () => {
  it("renders the map container", () => {
    render(<MapView items={[itemWithLocation]} />);
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
  });

  it("renders a TileLayer with OpenStreetMap url", () => {
    render(<MapView items={[itemWithLocation]} />);
    const tile = screen.getByTestId("tile-layer");
    expect(tile).toBeInTheDocument();
    expect(tile.dataset.url).toContain("tile.openstreetmap.org");
  });

  it("renders exactly one marker for one item WITH ubicacion", () => {
    render(<MapView items={[itemWithLocation]} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(1);
  });

  it("renders NO marker for an item WITHOUT ubicacion", () => {
    render(<MapView items={[itemWithoutLocation]} />);
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
  });

  it("renders markers only for items with ubicacion (mixed list)", () => {
    render(
      <MapView
        items={[itemWithLocation, itemWithoutLocation, itemWithLocation2]}
      />,
    );
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
  });

  it("renders NO markers for an empty list", () => {
    render(<MapView items={[]} />);
    expect(screen.queryAllByTestId("marker")).toHaveLength(0);
  });

  it("places marker at the correct lat/lng", () => {
    render(<MapView items={[itemWithLocation]} />);
    const marker = screen.getByTestId("marker");
    expect(JSON.parse(marker.dataset.position!)).toEqual([10.48, -66.87]);
  });

  it("renders a popup containing the titulo", () => {
    render(<MapView items={[itemWithLocation]} />);
    const popup = screen.getByTestId("popup");
    expect(
      within(popup).getByText("Edificio colapsado en Caracas"),
    ).toBeInTheDocument();
  });

  it("renders popup containing the ubicacion nombre", () => {
    render(<MapView items={[itemWithLocation]} />);
    const popup = screen.getByTestId("popup");
    expect(popup).toHaveTextContent("Caracas");
  });

  it("renders popup containing the sourceId", () => {
    render(<MapView items={[itemWithLocation]} />);
    const popup = screen.getByTestId("popup");
    expect(popup).toHaveTextContent("src-1");
  });

  it("marker uses a category DivIcon with non-empty html", () => {
    render(<MapView items={[itemWithLocation]} />);
    const marker = screen.getByTestId("marker");
    expect(marker.dataset.iconHtml).toBeTruthy();
    expect(marker.dataset.iconHtml!.length).toBeGreaterThan(0);
  });

  it("markers for different categories get different icons", () => {
    render(<MapView items={[itemWithLocation, itemWithLocation2]} />);
    const markers = screen.getAllByTestId("marker");
    const icons = markers.map((m) => m.dataset.iconHtml);
    // reportes vs desaparecidos differ in color + glyph
    expect(icons[0]).not.toEqual(icons[1]);
  });

  it("renders a hover tooltip with the titulo", () => {
    render(<MapView items={[itemWithLocation]} />);
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveTextContent("Edificio colapsado en Caracas");
  });

  it("groups markers inside a cluster group", () => {
    render(<MapView items={[itemWithLocation, itemWithLocation2]} />);
    const cluster = screen.getByTestId("cluster");
    expect(within(cluster).getAllByTestId("marker")).toHaveLength(2);
  });

  it("renders a locate (geolocation) button", () => {
    render(<MapView items={[itemWithLocation]} />);
    expect(
      screen.getByRole("button", { name: /mi ubicación/i }),
    ).toBeInTheDocument();
  });

  it("shows a message when geolocation is unavailable", async () => {
    const user = userEvent.setup();
    render(<MapView items={[itemWithLocation]} />);
    await user.click(screen.getByRole("button", { name: /mi ubicación/i }));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

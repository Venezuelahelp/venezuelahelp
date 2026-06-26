import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { Analytics } from "@/components/Analytics";
import type { Analytics as AnalyticsData } from "@/types";

const data: AnalyticsData = {
  kpis: { today: 5, last7: 21, last30: 137 },
  byCountry: [
    { key: "VE", count: 80 },
    { key: "US", count: 15 },
  ],
  byBrowser: [{ key: "Chrome", count: 60 }],
  byDevice: [{ key: "mobile", count: 70 }],
  recent: [
    {
      ts: "2026-06-26T12:00:00Z",
      country: "VE",
      browser: "Chrome",
      device: "mobile",
      os: "Android",
      path: "/mapa",
      referrer: "",
    },
  ],
};

describe("Analytics", () => {
  it("renders the KPIs", () => {
    render(<Analytics data={data} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("137")).toBeInTheDocument();
  });

  it("renders dimension breakdowns and a recent visit", () => {
    render(<Analytics data={data} />);
    expect(screen.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("/mapa")).toBeInTheDocument();
    // "VE"/"Chrome" aparecen en el desglose y en la visita reciente.
    expect(screen.getAllByText("VE").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Chrome").length).toBeGreaterThanOrEqual(2);
  });

  it("shows empty states when there is no data", () => {
    render(
      <Analytics
        data={{
          kpis: { today: 0, last7: 0, last30: 0 },
          byCountry: [],
          byBrowser: [],
          byDevice: [],
          recent: [],
        }}
      />,
    );
    expect(
      screen.getByText("Aún no hay visitas registradas."),
    ).toBeInTheDocument();
  });

  it("calls onRefresh when the refresh button is clicked", () => {
    const onRefresh = vi.fn();
    render(<Analytics data={data} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sources } from "@/components/Sources";
import type { Source } from "@/types";

const mockSources: Source[] = [
  {
    id: "src-1",
    nombre: "Fuente Alpha",
    url: "https://alpha.com",
    connector: "rss",
    enabled: true,
  },
  {
    id: "src-2",
    nombre: "Fuente Beta",
    url: "https://beta.com",
    connector: "rss",
    enabled: false,
  },
];

describe("Sources", () => {
  it("renders source names", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
      />,
    );
    expect(screen.getByText("Fuente Alpha")).toBeInTheDocument();
    expect(screen.getByText("Fuente Beta")).toBeInTheDocument();
  });

  it("renders source urls", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
      />,
    );
    expect(screen.getByText("https://alpha.com")).toBeInTheDocument();
    expect(screen.getByText("https://beta.com")).toBeInTheDocument();
  });

  it("calls onToggle(id, false) when enabled source toggle is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={onToggle}
        onScrape={vi.fn()}
        scraping={false}
      />,
    );

    // src-1 is enabled, clicking it should call onToggle("src-1", false)
    const toggle = screen.getByRole("checkbox", { name: /Fuente Alpha/i });
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledWith("src-1", false);
  });

  it("calls onToggle(id, true) when disabled source toggle is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={onToggle}
        onScrape={vi.fn()}
        scraping={false}
      />,
    );

    // src-2 is disabled, clicking it should call onToggle("src-2", true)
    const toggle = screen.getByRole("checkbox", { name: /Fuente Beta/i });
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledWith("src-2", true);
  });

  it("calls onScrape when scrape button is clicked", async () => {
    const onScrape = vi.fn();
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={onScrape}
        scraping={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /scrape ahora/i }));
    expect(onScrape).toHaveBeenCalledTimes(1);
  });

  it("disables scrape button when scraping is true", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={true}
      />,
    );
    expect(screen.getByRole("button", { name: /scraping/i })).toBeDisabled();
  });

  it("shows busy label on scrape button when scraping", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={true}
      />,
    );
    expect(
      screen.getByRole("button", { name: /scraping/i }),
    ).toBeInTheDocument();
  });
});

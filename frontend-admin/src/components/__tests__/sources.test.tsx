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

  // ── Add / delete source tests ──────────────────────────────────────────────

  it("renders a form to add a source with nombre and url inputs", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        creating={false}
      />,
    );
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
  });

  it("submitting the form calls onCreate with nombre, url and extractHint", async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={onCreate}
        onDelete={vi.fn()}
        creating={false}
      />,
    );

    await user.type(screen.getByLabelText(/nombre/i), "Nueva Fuente");
    await user.type(screen.getByLabelText(/url/i), "https://nueva.com");
    await user.click(screen.getByRole("button", { name: /agregar fuente/i }));

    expect(onCreate).toHaveBeenCalledWith({
      nombre: "Nueva Fuente",
      url: "https://nueva.com",
      extractHint: undefined,
    });
  });

  it("clears form fields after successful submit", async () => {
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        creating={false}
      />,
    );

    const nombreInput = screen.getByLabelText(/nombre/i);
    const urlInput = screen.getByLabelText(/url/i);

    await user.type(nombreInput, "Nueva Fuente");
    await user.type(urlInput, "https://nueva.com");
    await user.click(screen.getByRole("button", { name: /agregar fuente/i }));

    expect(nombreInput).toHaveValue("");
    expect(urlInput).toHaveValue("");
  });

  it("disables the submit button and shows busy label while creating", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        creating={true}
      />,
    );
    const btn = screen.getByRole("button", { name: /agregando/i });
    expect(btn).toBeDisabled();
  });

  it("each source row has an Eliminar button", () => {
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        creating={false}
      />,
    );
    const deleteButtons = screen.getAllByRole("button", { name: /eliminar/i });
    expect(deleteButtons).toHaveLength(2);
  });

  it("clicking Eliminar and confirming calls onDelete with the source id", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={onDelete}
        creating={false}
      />,
    );

    const deleteButtons = screen.getAllByRole("button", { name: /eliminar/i });
    await user.click(deleteButtons[0]); // src-1: Fuente Alpha

    expect(onDelete).toHaveBeenCalledWith("src-1");
  });

  it("does not call onDelete when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={onDelete}
        creating={false}
      />,
    );

    const deleteButtons = screen.getAllByRole("button", { name: /eliminar/i });
    await user.click(deleteButtons[0]);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("al elegir tipo 'API JSON' muestra el editor rest y el botón Probar", async () => {
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onCreateRest={vi.fn()}
        onProbe={vi.fn()}
        onDelete={vi.fn()}
        creating={false}
      />,
    );
    await user.click(screen.getByLabelText(/API JSON/i));
    expect(screen.getByLabelText(/Base de la API/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /probar/i })).toBeInTheDocument();
  });

  it("Probar llama onProbe con la RestConfig y muestra los stats", async () => {
    const onProbe = vi.fn().mockResolvedValue({
      endpointStats: [{ label: "reportes", fetched: 3 }],
      sample: [
        {
          category: "reportes",
          titulo: "Caso 1",
          texto: "x",
          sourceUrl: "https://o/1",
        },
      ],
    });
    const user = userEvent.setup();
    render(
      <Sources
        sources={mockSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onCreateRest={vi.fn()}
        onProbe={onProbe}
        onDelete={vi.fn()}
        creating={false}
      />,
    );
    await user.click(screen.getByLabelText(/API JSON/i));
    await user.type(
      screen.getByLabelText(/Base de la API/i),
      "https://api.x.com",
    );
    await user.type(screen.getByLabelText(/^Etiqueta$/i), "reportes");
    await user.type(
      screen.getByLabelText(/URL del endpoint/i),
      "https://api.x.com/api/reports",
    );
    await user.type(screen.getByLabelText(/^titulo$/i), "place");
    await user.click(screen.getByRole("button", { name: /probar/i }));

    expect(onProbe).toHaveBeenCalled();
    expect(await screen.findByText(/reportes: ✓ 3 ítems/i)).toBeInTheDocument();
    expect(screen.getByText(/Caso 1/i)).toBeInTheDocument();
  });

  it("muestra el estado de la fuente (status + lastFetched)", () => {
    const withStatus: Source[] = [
      {
        id: "s",
        nombre: "Sismo",
        url: "https://s.com",
        connector: "rest",
        enabled: true,
        status: "ok",
        lastFetched: 120,
      },
      {
        id: "b",
        nombre: "FuenteBloqueada",
        url: "https://b.com",
        connector: "jsonApi",
        enabled: false,
        status: "blocked",
      },
    ];
    render(
      <Sources
        sources={withStatus}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
      />,
    );
    expect(screen.getByText(/OK \(120\)/)).toBeInTheDocument();
    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
  });

  it("shows IA badge when source connector is ai", () => {
    const aiSources = [
      {
        id: "src-ai",
        nombre: "Fuente IA",
        url: "https://ai.com",
        connector: "ai",
        enabled: true,
      },
    ];
    render(
      <Sources
        sources={aiSources}
        onToggle={vi.fn()}
        onScrape={vi.fn()}
        scraping={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        creating={false}
      />,
    );
    expect(screen.getByText("IA")).toBeInTheDocument();
  });
});

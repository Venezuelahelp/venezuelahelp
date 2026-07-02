import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { Search } from "@/components/Search";
import type { SearchResult, Source } from "@/types";

const result: SearchResult = {
  items: [
    {
      category: "desaparecidos",
      sourceId: "s1",
      externalId: "e1",
      titulo: "Ana María Pérez",
      texto: "Vista por última vez en Caracas",
      trust: "corroborado",
      sourcesCount: 2,
      status: "buscando",
      sourceUrl: "https://fuente.example/ana",
    },
  ],
  total: 1,
};

const sources: Source[] = [
  {
    id: "s1",
    nombre: "Fuente 1",
    url: "https://fuente.example",
    connector: "rest",
    enabled: true,
  },
];

describe("Search", () => {
  it("busca con debounce y pinta la tabla de resultados", async () => {
    const onSearch = vi.fn().mockResolvedValue(result);
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ana" },
    });
    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        q: "ana",
        category: undefined,
        limit: 50,
      }),
    );
    expect(await screen.findByText("Ana María Pérez")).toBeInTheDocument();
    expect(screen.getByText("En 2 fuentes")).toBeInTheDocument();
    expect(screen.getByText("buscando")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver original" })).toHaveAttribute(
      "href",
      "https://fuente.example/ana",
    );
  });

  it("debounce: una sola llamada aunque se tipee rápido", async () => {
    const onSearch = vi.fn().mockResolvedValue(result);
    render(<Search onSearch={onSearch} sources={sources} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "an" } });
    fireEvent.change(input, { target: { value: "ana" } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(1));
    expect(onSearch).toHaveBeenCalledWith({
      q: "ana",
      category: undefined,
      limit: 50,
    });
  });

  it("filtra por categoría sin texto", async () => {
    const onSearch = vi.fn().mockResolvedValue({ items: [], total: 0 });
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "acopios" },
    });
    await waitFor(() =>
      expect(onSearch).toHaveBeenCalledWith({
        q: undefined,
        category: "acopios",
        limit: 50,
      }),
    );
    expect(await screen.findByText("Sin resultados.")).toBeInTheDocument();
  });

  it("sin sourceUrl, «Ver original» cae a la home de la fuente", async () => {
    const onSearch = vi.fn().mockResolvedValue({
      items: [{ ...result.items[0], sourceUrl: undefined }],
      total: 1,
    });
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ana" },
    });
    expect(
      await screen.findByRole("link", { name: "Ver original" }),
    ).toHaveAttribute("href", "https://fuente.example");
  });

  it("muestra error si la búsqueda falla", async () => {
    const onSearch = vi.fn().mockRejectedValue(new Error("500"));
    render(<Search onSearch={onSearch} sources={sources} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "ana" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo buscar.",
    );
  });

  it("estado inicial: instrucciones, sin llamar al API", () => {
    const onSearch = vi.fn();
    render(<Search onSearch={onSearch} sources={sources} />);
    expect(
      screen.getByText(
        "Escribí un término o elegí una categoría para buscar en el snapshot.",
      ),
    ).toBeInTheDocument();
    expect(onSearch).not.toHaveBeenCalled();
  });
});

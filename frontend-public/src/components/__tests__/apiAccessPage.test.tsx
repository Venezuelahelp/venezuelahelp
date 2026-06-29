import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import ApiAccessPage from "@/components/ApiAccessPage";

function fill() {
  fireEvent.change(screen.getByLabelText(/nombre/i), {
    target: { value: "Cruz Roja" },
  });
  fireEvent.change(screen.getByLabelText(/correo/i), {
    target: { value: "datos@cruzroja.org" },
  });
  fireEvent.change(screen.getByLabelText(/uso|motivo/i), {
    target: { value: "Mostrar desaparecidos en nuestro portal" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("ApiAccessPage", () => {
  it("renders the request form and the API docs", () => {
    render(<ApiAccessPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /api/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    // Documenta el endpoint y la autenticación por key.
    expect(screen.getByText(/\/v1\/items/)).toBeInTheDocument();
  });

  it("submits the form and shows a success message", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<ApiAccessPage submit={submit} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /enviar|solicitar/i }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: "Cruz Roja",
          email: "datos@cruzroja.org",
          aceptaTerminos: true,
        }),
      ),
    );
    expect(await screen.findByText(/recibimos|recibida|gracias/i)).toBeInTheDocument();
  });

  it("shows an error if the submission fails", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("HTTP 429"));
    render(<ApiAccessPage submit={submit} />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /enviar|solicitar/i }));
    expect(await screen.findByText(/no se pudo|error|inténtalo/i)).toBeInTheDocument();
  });
});

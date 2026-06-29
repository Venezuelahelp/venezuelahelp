import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ApiRequests } from "@/components/ApiRequests";
import type { ApiAccessRequest, ApiKey, ApproveResult } from "@/types";

const req: ApiAccessRequest = {
  id: "r1",
  nombre: "Cruz Roja",
  email: "datos@cruzroja.org",
  motivo: "Portal",
  status: "pendiente",
  createdAt: "2026-06-29T00:00:00.000Z",
};

const key: ApiKey = {
  keyId: "k1",
  consumerName: "Cruz Roja",
  email: "datos@cruzroja.org",
  requestId: "r1",
  status: "active",
  createdAt: "2026-06-29T01:00:00.000Z",
};

function setup(over: Partial<React.ComponentProps<typeof ApiRequests>> = {}) {
  const props = {
    requests: [req],
    keys: [key],
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onRevoke: vi.fn(),
    ...over,
  };
  render(<ApiRequests {...props} />);
  return props;
}

describe("ApiRequests", () => {
  it("lists pending requests with the contact email", () => {
    setup();
    // "Cruz Roja" aparece en la solicitud y en la key emitida.
    expect(screen.getAllByText("Cruz Roja").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/datos@cruzroja\.org/).length).toBeGreaterThan(0);
  });

  it("approving shows the raw key exactly once", async () => {
    const approveResult: ApproveResult = {
      request: { ...req, status: "aprobada" },
      apiKey: key,
      rawKey: "vh_live_SECRET",
    };
    const onApprove = vi.fn().mockResolvedValue(approveResult);
    setup({ onApprove });
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText(/vh_live_SECRET/)).toBeInTheDocument();
    // Mensaje de "se muestra una sola vez".
    expect(screen.getByText(/no se vuelve a poder ver/i)).toBeInTheDocument();
  });

  it("rejecting calls onReject", () => {
    const { onReject } = setup();
    fireEvent.click(screen.getByRole("button", { name: /rechazar/i }));
    expect(onReject).toHaveBeenCalledWith("r1");
  });

  it("lists issued keys and revokes them", () => {
    const { onRevoke } = setup();
    expect(screen.getByText("k1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /revocar/i }));
    expect(onRevoke).toHaveBeenCalledWith("k1");
  });
});

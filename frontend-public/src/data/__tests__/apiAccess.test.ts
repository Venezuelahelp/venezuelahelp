import { describe, it, expect, vi } from "vitest";
import { submitApiAccessRequest } from "@/data/apiAccess";

const form = {
  nombre: "Cruz Roja",
  email: "datos@cruzroja.org",
  organizacion: "Cruz Roja VE",
  motivo: "Mostrar desaparecidos",
  descripcion: "Portal",
  aceptaTerminos: true as const,
};

describe("submitApiAccessRequest", () => {
  it("POSTs the form as JSON to the access-requests endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 202 } as Response);
    await submitApiAccessRequest(form, fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api-access\/requests$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ email: "datos@cruzroja.org" });
  });

  it("throws on a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(submitApiAccessRequest(form, fetchMock)).rejects.toThrow();
  });
});

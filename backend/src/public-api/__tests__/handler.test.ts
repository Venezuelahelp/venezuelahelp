import { describe, it, expect, vi } from "vitest";
import { handler } from "@/public-api/handler";
import type { ApiAccessRequest } from "@/shared/types";

const validBody = {
  nombre: "Cruz Roja",
  email: "datos@cruzroja.org",
  organizacion: "Cruz Roja VE",
  motivo: "Mostrar desaparecidos en nuestro portal",
  descripcion: "Portal humanitario",
  aceptaTerminos: true,
};

function ev(body: unknown, sourceIp = "1.2.3.4") {
  return {
    requestContext: { http: { method: "POST", sourceIp } },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function deps(over: {
  put?: (r: ApiAccessRequest) => Promise<void>;
  hit?: () => Promise<{ allowed: boolean; count: number }>;
} = {}) {
  return {
    apiRequestRepo: { put: over.put ?? (async () => {}) },
    rateLimit: { hit: over.hit ?? (async () => ({ allowed: true, count: 1 })) },
    now: () => "2026-06-29T00:00:00.000Z",
    genId: () => "fixed-id",
  };
}

describe("public-api intake handler", () => {
  it("accepts a valid request and stores it as pendiente (202)", async () => {
    const put = vi.fn(async () => {});
    const res = await handler(ev(validBody), deps({ put }));
    expect(res.statusCode).toBe(202);
    const stored = put.mock.calls[0][0];
    expect(stored).toMatchObject({
      id: "fixed-id",
      nombre: "Cruz Roja",
      email: "datos@cruzroja.org",
      status: "pendiente",
      createdAt: "2026-06-29T00:00:00.000Z",
    });
  });

  it("rejects an invalid body (missing email) with 400", async () => {
    const put = vi.fn(async () => {});
    const { email, ...noEmail } = validBody;
    const res = await handler(ev(noEmail), deps({ put }));
    expect(res.statusCode).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects when terms are not accepted", async () => {
    const res = await handler(
      ev({ ...validBody, aceptaTerminos: false }),
      deps(),
    );
    expect(res.statusCode).toBe(400);
  });

  it("rate-limits by source IP (429)", async () => {
    const put = vi.fn(async () => {});
    const res = await handler(
      ev(validBody),
      deps({ put, hit: async () => ({ allowed: false, count: 99 }) }),
    );
    expect(res.statusCode).toBe(429);
    expect(put).not.toHaveBeenCalled();
  });

  it("OPTIONS returns 204 (preflight)", async () => {
    const res = await handler(
      { ...ev(validBody), requestContext: { http: { method: "OPTIONS", sourceIp: "1.2.3.4" } } },
      deps(),
    );
    expect(res.statusCode).toBe(204);
  });
});

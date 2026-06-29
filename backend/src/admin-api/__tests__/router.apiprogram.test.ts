import { describe, it, expect, vi } from "vitest";
import { route, type RouteDeps } from "@/admin-api/router";
import type { ApiAccessRequest, ApiKey } from "@/shared/types";

const pendingReq: ApiAccessRequest = {
  id: "req-1",
  nombre: "Cruz Roja",
  email: "datos@cruzroja.org",
  motivo: "Portal",
  status: "pendiente",
  createdAt: "2026-06-29T00:00:00.000Z",
};

const issuedKey: ApiKey = {
  keyId: "key-1",
  consumerName: "Cruz Roja",
  email: "datos@cruzroja.org",
  requestId: "req-1",
  status: "active",
  createdAt: "2026-06-29T01:00:00.000Z",
};

function makeDeps(over: Partial<RouteDeps> = {}): RouteDeps {
  return {
    apiRequestRepo: {
      list: vi.fn().mockResolvedValue([pendingReq]),
      get: vi.fn().mockResolvedValue(pendingReq),
      setStatus: vi.fn().mockResolvedValue(undefined),
    },
    apiKeyRepo: {
      list: vi.fn().mockResolvedValue([issuedKey]),
      create: vi
        .fn()
        .mockResolvedValue({ rawKey: "vh_live_abc", apiKey: issuedKey }),
      revoke: vi.fn().mockResolvedValue(true),
    },
    actor: "admin@x.com",
    now: () => "2026-06-29T02:00:00.000Z",
    // El resto de deps no se usan en estas rutas.
    ...over,
  } as unknown as RouteDeps;
}

describe("admin-api router — programa de API", () => {
  it("GET /api-requests lists requests", async () => {
    const deps = makeDeps();
    const res = await route("GET", "/api-requests", null, deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([pendingReq]);
  });

  it("POST /api-requests/{id}/approve creates a key and returns rawKey once", async () => {
    const deps = makeDeps();
    const res = await route("POST", "/api-requests/req-1/approve", null, deps);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rawKey: "vh_live_abc" });
    expect(deps.apiKeyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", email: "datos@cruzroja.org" }),
    );
    expect(deps.apiRequestRepo.setStatus).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({
        status: "aprobada",
        reviewedBy: "admin@x.com",
        apiKeyId: "key-1",
      }),
    );
  });

  it("approve returns 404 for an unknown request", async () => {
    const deps = makeDeps({
      apiRequestRepo: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        setStatus: vi.fn(),
      },
    });
    const res = await route("POST", "/api-requests/nope/approve", null, deps);
    expect(res.status).toBe(404);
  });

  it("approve returns 409 if the request is not pendiente", async () => {
    const deps = makeDeps({
      apiRequestRepo: {
        list: vi.fn(),
        get: vi.fn().mockResolvedValue({ ...pendingReq, status: "aprobada" }),
        setStatus: vi.fn(),
      },
    });
    const res = await route("POST", "/api-requests/req-1/approve", null, deps);
    expect(res.status).toBe(409);
    expect(deps.apiKeyRepo.create).not.toHaveBeenCalled();
  });

  it("POST /api-requests/{id}/reject sets status rechazada", async () => {
    const deps = makeDeps();
    const res = await route("POST", "/api-requests/req-1/reject", null, deps);
    expect(res.status).toBe(200);
    expect(deps.apiRequestRepo.setStatus).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({ status: "rechazada", reviewedBy: "admin@x.com" }),
    );
  });

  it("GET /api-keys lists issued keys", async () => {
    const deps = makeDeps();
    const res = await route("GET", "/api-keys", null, deps);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([issuedKey]);
  });

  it("POST /api-keys/{id}/revoke revokes the key", async () => {
    const deps = makeDeps();
    const res = await route("POST", "/api-keys/key-1/revoke", null, deps);
    expect(res.status).toBe(200);
    expect(deps.apiKeyRepo.revoke).toHaveBeenCalledWith(
      "key-1",
      "2026-06-29T02:00:00.000Z",
    );
  });

  it("revoke returns 404 when the key is unknown", async () => {
    const deps = makeDeps({
      apiKeyRepo: {
        list: vi.fn(),
        create: vi.fn(),
        revoke: vi.fn().mockResolvedValue(false),
      },
    });
    const res = await route("POST", "/api-keys/nope/revoke", null, deps);
    expect(res.status).toBe(404);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSnapshot } from "../useSnapshot";
import type { Snapshot } from "@/types";

describe("useSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should load and return data on successful fetch", async () => {
    const mockData: Snapshot = {
      generatedAt: "2026-06-26T00:00:00Z",
      categories: {
        reportes: [],
        desaparecidos: [],
        acopios: [],
        edificios: [],
        solicitudes: [],
        hospitales: [],
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => "application/json" },
          json: () => Promise.resolve(mockData),
        }),
      ) as any,
    );

    const { result } = renderHook(() => useSnapshot());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
  });

  it("should error on a 200 with a non-JSON body (masked 403 → index.html)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => "text/html" },
          json: () => Promise.resolve({}),
        }),
      ) as any,
    );

    const { result } = renderHook(() => useSnapshot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toMatch(/inesperada/i);
  });

  it("should set error when fetch fails", async () => {
    const mockError = new Error("Network error");

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(mockError)) as any);

    const { result } = renderHook(() => useSnapshot());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe("Network error");
  });

  it("should set error when response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.reject(new Error("Not found")),
        }),
      ) as any,
    );

    const { result } = renderHook(() => useSnapshot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe("HTTP 404");
  });

  it("revalidates on every fetch (cache: no-cache) so devices don't get stuck on a stale snapshot", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: { get: () => "application/json" },
        json: () =>
          Promise.resolve({
            generatedAt: "2026-06-30T23:28:43Z",
            categories: {
              reportes: [],
              desaparecidos: [],
              acopios: [],
              edificios: [],
              solicitudes: [],
            },
          }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock as any);

    const { result } = renderHook(() => useSnapshot());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: "no-cache" }),
    );
  });

  it("auto-refreshes the snapshot every minute", async () => {
    vi.useFakeTimers();
    const ok = (gen: string) =>
      Promise.resolve({
        ok: true,
        headers: { get: () => "application/json" },
        json: () =>
          Promise.resolve({
            generatedAt: gen,
            categories: {
              reportes: [],
              desaparecidos: [],
              acopios: [],
              edificios: [],
              solicitudes: [],
            },
          }),
      });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(ok("v1"))
      .mockReturnValueOnce(ok("v2"));
    vi.stubGlobal("fetch", fetchMock as any);

    const { result } = renderHook(() => useSnapshot());

    await vi.waitFor(() => {
      expect(result.current.data?.generatedAt).toBe("v1");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Avanza 1 minuto → segundo fetch, datos actualizados sin recargar.
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => {
      expect(result.current.data?.generatedAt).toBe("v2");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

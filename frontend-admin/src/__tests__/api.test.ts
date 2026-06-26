import { createApi } from "@/api";

const API_URL = "https://api.example.com";
const TOKEN = "test-token-123";

function makeGetToken(token: string | null = TOKEN) {
  return vi.fn().mockResolvedValue(token);
}

function makeOkFetch(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  });
}

function makeErrorFetch(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
  });
}

describe("createApi", () => {
  describe("getConfig", () => {
    it("calls GET /config with bearer token", async () => {
      const mockFetch = makeOkFetch({ scrapeRateMin: 30 });
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.getConfig();

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/config`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
      });
    });

    it("returns the parsed JSON", async () => {
      const cfg = {
        scrapeRateMin: 60,
        bedrockModelId: "m1",
        systemPrompt: "sp",
        botTriggerMode: "all",
      };
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeOkFetch(cfg),
      });

      const result = await api.getConfig();
      expect(result).toEqual(cfg);
    });

    it("throws HTTP error on non-ok response", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(403),
      });
      await expect(api.getConfig()).rejects.toThrow("HTTP 403");
    });
  });

  describe("putConfig", () => {
    it("calls PUT /config with bearer token and JSON body", async () => {
      const mockFetch = makeOkFetch({ scrapeRateMin: 15 });
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });
      const cfg = {
        scrapeRateMin: 15,
        bedrockModelId: "m2",
        systemPrompt: "p",
        botTriggerMode: "mention",
      };

      await api.putConfig(cfg);

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/config`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(cfg),
      });
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(400),
      });
      await expect(api.putConfig({} as never)).rejects.toThrow("HTTP 400");
    });
  });

  describe("getSources", () => {
    it("calls GET /sources with bearer token", async () => {
      const mockFetch = makeOkFetch([]);
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.getSources();

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/sources`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
      });
    });

    it("returns source array", async () => {
      const sources = [
        {
          id: "s1",
          nombre: "Fuente 1",
          url: "http://x",
          connector: "rss",
          enabled: true,
        },
      ];
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeOkFetch(sources),
      });

      const result = await api.getSources();
      expect(result).toEqual(sources);
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(500),
      });
      await expect(api.getSources()).rejects.toThrow("HTTP 500");
    });
  });

  describe("patchSource", () => {
    it("calls PATCH /sources/:id with bearer token and enabled body", async () => {
      const mockFetch = makeOkFetch({ id: "s1", enabled: false });
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.patchSource("s1", false);

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/sources/s1`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      });
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(404),
      });
      await expect(api.patchSource("x", true)).rejects.toThrow("HTTP 404");
    });
  });

  describe("scrapeNow", () => {
    it("calls POST /scrape with bearer token", async () => {
      const mockFetch = makeOkFetch();
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.scrapeNow();

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/scrape`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
      });
    });

    it("returns void (undefined) on success", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeOkFetch({ ignored: true }),
      });
      const result = await api.scrapeNow();
      expect(result).toBeUndefined();
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(429),
      });
      await expect(api.scrapeNow()).rejects.toThrow("HTTP 429");
    });
  });

  describe("getStats", () => {
    it("calls GET /stats with bearer token", async () => {
      const mockFetch = makeOkFetch({ counts: {}, sources: [] });
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.getStats();

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/stats`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
      });
    });

    it("returns stats", async () => {
      const stats = {
        counts: { reportes: 5 },
        sources: [{ id: "s1", nombre: "F", enabled: true }],
      };
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeOkFetch(stats),
      });

      const result = await api.getStats();
      expect(result).toEqual(stats);
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(401),
      });
      await expect(api.getStats()).rejects.toThrow("HTTP 401");
    });
  });

  describe("createSource", () => {
    it("calls POST /sources with bearer token and JSON body", async () => {
      const newSource = {
        id: "new-1",
        nombre: "Nueva",
        url: "https://nueva.com",
        connector: "rss",
        enabled: true,
      };
      const mockFetch = makeOkFetch(newSource);
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.createSource({ nombre: "Nueva", url: "https://nueva.com" });

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/sources`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ nombre: "Nueva", url: "https://nueva.com" }),
      });
    });

    it("returns the created Source", async () => {
      const newSource = {
        id: "new-1",
        nombre: "Nueva",
        url: "https://nueva.com",
        connector: "rss",
        enabled: true,
      };
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeOkFetch(newSource),
      });

      const result = await api.createSource({
        nombre: "Nueva",
        url: "https://nueva.com",
      });
      expect(result).toEqual(newSource);
    });

    it("includes extractHint in body when provided", async () => {
      const mockFetch = makeOkFetch({ id: "new-1" });
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.createSource({
        nombre: "Nueva",
        url: "https://nueva.com",
        extractHint: "noticias recientes",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${API_URL}/sources`,
        expect.objectContaining({
          body: JSON.stringify({
            nombre: "Nueva",
            url: "https://nueva.com",
            extractHint: "noticias recientes",
          }),
        }),
      );
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(400),
      });
      await expect(
        api.createSource({ nombre: "Nueva", url: "https://nueva.com" }),
      ).rejects.toThrow("HTTP 400");
    });
  });

  describe("deleteSource", () => {
    it("calls DELETE /sources/:id with bearer token", async () => {
      const mockFetch = makeOkFetch({ deleted: "s1" });
      const api = createApi(API_URL, makeGetToken(), { fetch: mockFetch });

      await api.deleteSource("s1");

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/sources/s1`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
      });
    });

    it("returns void on success", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeOkFetch({ deleted: "s1" }),
      });
      const result = await api.deleteSource("s1");
      expect(result).toBeUndefined();
    });

    it("throws on non-ok", async () => {
      const api = createApi(API_URL, makeGetToken(), {
        fetch: makeErrorFetch(404),
      });
      await expect(api.deleteSource("s1")).rejects.toThrow("HTTP 404");
    });
  });
});

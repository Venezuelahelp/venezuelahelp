import { createApi } from "@/api";

const API_URL = "https://api.example.com";

function makeGetToken() {
  return vi.fn().mockResolvedValue("tok");
}

function makeOkFetch(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("createApi — observabilidad", () => {
  it("getQaLogs llama GET /qa-logs/{chatId}?limit=50", async () => {
    const fetch = makeOkFetch([{ ts: "t1" }]);
    const api = createApi(API_URL, makeGetToken(), { fetch });
    const res = await api.getQaLogs(7);
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/qa-logs/7?limit=50`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(res).toEqual([{ ts: "t1" }]);
  });

  it("searchItems arma el query string con q, category y limit", async () => {
    const fetch = makeOkFetch({ items: [], total: 0 });
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.searchItems({ q: "ana maría", category: "desaparecidos" });
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/items/search?q=ana+mar%C3%ADa&category=desaparecidos&limit=50`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("searchItems omite q y category vacíos", async () => {
    const fetch = makeOkFetch({ items: [], total: 0 });
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.searchItems({ category: "acopios", limit: 20 });
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/items/search?category=acopios&limit=20`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("getScrapeRuns llama GET /scrape-runs?limit=10", async () => {
    const fetch = makeOkFetch([]);
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.getScrapeRuns();
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/scrape-runs?limit=10`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});

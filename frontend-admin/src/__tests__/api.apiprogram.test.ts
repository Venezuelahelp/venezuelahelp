import { createApi } from "@/api";

const API_URL = "https://api.example.com";
const TOKEN = "tok";

function makeGetToken() {
  return vi.fn().mockResolvedValue(TOKEN);
}

function makeOkFetch(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe("createApi — programa de API", () => {
  it("getApiRequests calls GET /api-requests", async () => {
    const fetch = makeOkFetch([{ id: "r1" }]);
    const api = createApi(API_URL, makeGetToken(), { fetch });
    const res = await api.getApiRequests();
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/api-requests`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(res).toEqual([{ id: "r1" }]);
  });

  it("approveApiRequest POSTs to /api-requests/{id}/approve and returns rawKey", async () => {
    const fetch = makeOkFetch({ rawKey: "vh_live_x", apiKey: {}, request: {} });
    const api = createApi(API_URL, makeGetToken(), { fetch });
    const res = await api.approveApiRequest("r1");
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/api-requests/r1/approve`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(res.rawKey).toBe("vh_live_x");
  });

  it("rejectApiRequest POSTs to /api-requests/{id}/reject", async () => {
    const fetch = makeOkFetch({});
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.rejectApiRequest("r1");
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/api-requests/r1/reject`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getApiKeys calls GET /api-keys", async () => {
    const fetch = makeOkFetch([{ keyId: "k1" }]);
    const api = createApi(API_URL, makeGetToken(), { fetch });
    const res = await api.getApiKeys();
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/api-keys`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(res).toEqual([{ keyId: "k1" }]);
  });

  it("revokeApiKey POSTs to /api-keys/{id}/revoke", async () => {
    const fetch = makeOkFetch({ revoked: true });
    const api = createApi(API_URL, makeGetToken(), { fetch });
    await api.revokeApiKey("k1");
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/api-keys/k1/revoke`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});

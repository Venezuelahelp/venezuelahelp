import { loadRuntimeConfig } from "@/config";

const mockConfig = {
  apiUrl: "https://api.example.com",
  userPoolId: "us-east-1_TEST",
  userPoolClientId: "TEST_CLIENT",
  region: "us-east-1",
};

describe("loadRuntimeConfig", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /config.json and returns parsed config", async () => {
    const config = await loadRuntimeConfig();
    expect(config).toEqual(mockConfig);
    expect(fetch).toHaveBeenCalledWith("/config.json");
  });

  it("throws when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    await expect(loadRuntimeConfig()).rejects.toThrow(
      "Failed to load runtime config: 404",
    );
  });
});

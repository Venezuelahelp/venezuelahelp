import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";
import type { Config, Source, Stats } from "@/types";
import type { RuntimeConfig } from "@/config";

// Mock @/auth so Login's signInUser is controlled in tests
vi.mock("@/auth", () => ({
  signInUser: vi.fn().mockResolvedValue({}),
  signOutUser: vi.fn().mockResolvedValue(undefined),
  getIdToken: vi.fn().mockResolvedValue(null),
  configureAuth: vi.fn(),
}));

const mockRuntimeConfig: RuntimeConfig = {
  apiUrl: "https://api.test",
  userPoolId: "us-east-1_test",
  userPoolClientId: "test-client",
  region: "us-east-1",
};

const mockStats: Stats = {
  counts: {
    reportes: 10,
    desaparecidos: 5,
    acopios: 3,
    edificios: 1,
    solicitudes: 2,
  },
  sources: [{ id: "s1", nombre: "Test Source", enabled: true }],
};

const mockSources: Source[] = [
  {
    id: "s1",
    nombre: "Test Source",
    url: "https://test.com",
    connector: "rss",
    enabled: true,
  },
];

const mockConfig: Config = {
  botTriggerMode: "mention",
  bedrockModelId: "anthropic.claude-3-sonnet",
  systemPrompt: "You are helpful",
  scrapeRateMin: 60,
};

function buildMockApi() {
  return {
    getConfig: vi.fn().mockResolvedValue(mockConfig),
    putConfig: vi
      .fn()
      .mockImplementation((cfg: Config) => Promise.resolve(cfg)),
    getSources: vi.fn().mockResolvedValue(mockSources),
    patchSource: vi
      .fn()
      .mockImplementation((id: string, enabled: boolean): Promise<Source> =>
        Promise.resolve({ ...mockSources[0], id, enabled }),
      ),
    scrapeNow: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue(mockStats),
    getAnalytics: vi.fn().mockResolvedValue({
      kpis: { today: 0, last7: 0, last30: 0 },
      byCountry: [],
      byBrowser: [],
      byDevice: [],
      recent: [],
    }),
    getTgUsers: vi.fn().mockResolvedValue([]),
    createSource: vi.fn().mockResolvedValue({
      id: "new-1",
      nombre: "Nueva",
      url: "https://nueva.com",
      connector: "rss",
      enabled: true,
    } as Source),
    deleteSource: vi.fn().mockResolvedValue(undefined),
    createRestSource: vi.fn().mockResolvedValue({
      id: "rest-1",
      nombre: "API",
      url: "https://api.com",
      connector: "rest",
      enabled: true,
    } as Source),
    updateSourceConfig: vi.fn().mockResolvedValue({
      id: "rest-1",
      nombre: "API",
      url: "https://api.com",
      connector: "rest",
      enabled: true,
    } as Source),
    probeSource: vi.fn().mockResolvedValue({ endpointStats: [], sample: [] }),
    getApiRequests: vi.fn().mockResolvedValue([]),
    approveApiRequest: vi
      .fn()
      .mockResolvedValue({ request: {}, apiKey: {}, rawKey: "vh_live_x" }),
    rejectApiRequest: vi.fn().mockResolvedValue(undefined),
    getApiKeys: vi.fn().mockResolvedValue([]),
    revokeApiKey: vi.fn().mockResolvedValue(undefined),
  };
}

function buildDeps(getIdToken: () => Promise<string | null>) {
  const api = buildMockApi();
  const deps = {
    loadRuntimeConfig: vi
      .fn()
      .mockResolvedValue(mockRuntimeConfig) as () => Promise<RuntimeConfig>,
    configureAuth: vi.fn() as (cfg: RuntimeConfig) => void,
    getIdToken,
    signOutUser: vi.fn().mockResolvedValue(undefined) as () => Promise<void>,
    createApi: vi.fn().mockReturnValue(api) as (
      apiUrl: string,
      getToken: () => Promise<string | null>,
    ) => typeof api,
  };
  return { deps, api };
}

describe("App (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Login when getIdToken returns null", async () => {
    const { deps } = buildDeps(() => Promise.resolve(null));
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Administración/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows app navigation when authenticated", async () => {
    const { deps } = buildDeps(() => Promise.resolve("mock-token"));
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Fuentes/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Config/i })).toBeInTheDocument();
  });

  it("shows Dashboard content by default when authenticated", async () => {
    const { deps } = buildDeps(() => Promise.resolve("mock-token"));
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByText(/Conteos por categoría/i)).toBeInTheDocument();
    });
  });

  it("shows sign-out button in header when authenticated", async () => {
    const { deps } = buildDeps(() => Promise.resolve("mock-token"));
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /cerrar sesión/i }),
      ).toBeInTheDocument();
    });
  });

  it("after login onAuthed, shows app shell with nav", async () => {
    // First call returns null (not authed), second call returns token (authed)
    const getIdToken = vi
      .fn<[], Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue("mock-token");

    const { deps } = buildDeps(getIdToken);
    const user = userEvent.setup();
    render(<App deps={deps} />);

    // Login is shown first
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Administración/i }),
      ).toBeInTheDocument();
    });

    // Fill and submit login form
    await user.type(screen.getByLabelText(/correo/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "password");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    // App shell should appear after onAuthed
    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });
  });

  it("switching to Config tab shows the Config form", async () => {
    const { deps } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Config/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Guardar cambios/i }),
      ).toBeInTheDocument();
    });
  });

  it("saving config calls api.putConfig", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Config/i }));
    const saveButton = await screen.findByRole("button", {
      name: /Guardar cambios/i,
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(api.putConfig).toHaveBeenCalledTimes(1);
    });
  });

  it("switching to Fuentes tab and toggling a source calls api.patchSource", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Fuentes/i }));

    await waitFor(() => {
      expect(screen.getByText("Test Source")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("checkbox", { name: /Test Source/i });
    await user.click(toggle);

    await waitFor(() => {
      expect(api.patchSource).toHaveBeenCalledWith("s1", false);
    });
  });

  it("shows error banner when putConfig rejects", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    api.putConfig = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Config/i }));
    const saveButton = await screen.findByRole("button", {
      name: /Guardar cambios/i,
    });
    await user.click(saveButton);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent("No se pudo guardar la configuración.");
    });
  });

  it("creating a source in Fuentes tab calls api.createSource and refreshes sources", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Fuentes/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/nombre/i), "Nueva Fuente");
    await user.type(screen.getByLabelText(/url/i), "https://nueva.com");
    await user.click(screen.getByRole("button", { name: /agregar fuente/i }));

    await waitFor(() => {
      expect(api.createSource).toHaveBeenCalledWith({
        nombre: "Nueva Fuente",
        url: "https://nueva.com",
        extractHint: undefined,
      });
    });

    await waitFor(() => {
      expect(api.getSources).toHaveBeenCalledTimes(2); // initial load + refresh
    });
  });

  it("shows error banner when createSource rejects", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    api.createSource = vi.fn().mockRejectedValue(new Error("HTTP 400"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Fuentes/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/nombre/i), "Nueva Fuente");
    await user.type(screen.getByLabelText(/url/i), "https://nueva.com");
    await user.click(screen.getByRole("button", { name: /agregar fuente/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent("No se pudo agregar la fuente.");
    });
  });

  it("deleting a source in Fuentes tab calls api.deleteSource and refreshes sources", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Fuentes/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /eliminar/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /eliminar/i }));

    await waitFor(() => {
      expect(api.deleteSource).toHaveBeenCalledWith("s1");
    });

    await waitFor(() => {
      expect(api.getSources).toHaveBeenCalledTimes(2); // initial load + refresh
    });
  });

  it("clicking 'Scrape ahora' calls scrapeNow and shows a started notice", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Fuentes/i }));
    await user.click(screen.getByRole("button", { name: /scrape ahora/i }));

    await waitFor(() => {
      expect(api.scrapeNow).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/Scrape iniciado/i);
    });
  });

  it("clicking 'Actualizar' in Dashboard re-fetches stats", async () => {
    const { deps, api } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    await waitFor(() => {
      expect(screen.getByText(/Conteos por categoría/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /actualizar/i }));

    await waitFor(() => {
      expect(api.getStats).toHaveBeenCalledTimes(2); // initial load + refresh
    });
  });

  it("sign-out calls signOutUser and reverts to Login screen", async () => {
    const { deps } = buildDeps(() => Promise.resolve("mock-token"));
    const user = userEvent.setup();
    render(<App deps={deps} />);

    // Wait for the authenticated shell to appear
    await waitFor(() => {
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    // Click the sign-out button
    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    // signOutUser dep should have been called
    expect(deps.signOutUser).toHaveBeenCalledTimes(1);

    // Login screen should reappear (email field is present)
    await waitFor(() => {
      expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    });
  });
});

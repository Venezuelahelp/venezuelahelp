import { useState, useEffect, useRef } from "react";
import { Login } from "@/components/Login";
import { Dashboard } from "@/components/Dashboard";
import { Sources } from "@/components/Sources";
import { Config } from "@/components/Config";
import { Analytics } from "@/components/Analytics";
import { Users } from "@/components/Users";
import { ApiRequests } from "@/components/ApiRequests";
import { Search } from "@/components/Search";
import {
  loadRuntimeConfig as defaultLoadConfig,
  type RuntimeConfig,
} from "@/config";
import {
  configureAuth as defaultConfigureAuth,
  getIdToken as defaultGetIdToken,
  signOutUser as defaultSignOutUser,
} from "@/auth";
import { createApi as defaultCreateApi } from "@/api";
import type {
  Config as ConfigType,
  Source,
  Stats,
  Analytics as AnalyticsData,
  TgUser,
  ApiAccessRequest,
  ApiKey,
  ScrapeRun,
} from "@/types";
import styles from "./App.module.css";

type ApiClient = ReturnType<typeof defaultCreateApi>;
type Tab =
  "dashboard" | "analytics" | "users" | "search" | "sources" | "config" | "api";

export interface AppDeps {
  loadRuntimeConfig?: () => Promise<RuntimeConfig>;
  configureAuth?: (cfg: RuntimeConfig) => void;
  getIdToken?: () => Promise<string | null>;
  signOutUser?: () => Promise<void>;
  createApi?: (
    apiUrl: string,
    getToken: () => Promise<string | null>,
  ) => ApiClient;
}

interface AppProps {
  deps?: AppDeps;
}

export default function App({ deps = {} }: AppProps) {
  const {
    loadRuntimeConfig = defaultLoadConfig,
    configureAuth = defaultConfigureAuth,
    getIdToken = defaultGetIdToken,
    signOutUser = defaultSignOutUser,
    createApi = defaultCreateApi,
  } = deps;

  // null = initializing, false = unauthenticated, true = authenticated
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [tgUsers, setTgUsers] = useState<TgUser[] | null>(null);
  const [busyBlockChatId, setBusyBlockChatId] = useState<number | undefined>(
    undefined,
  );
  const [sources, setSources] = useState<Source[] | null>(null);
  const [config, setConfig] = useState<ConfigType | null>(null);
  const [apiRequests, setApiRequests] = useState<ApiAccessRequest[] | null>(
    null,
  );
  const [apiKeys, setApiKeys] = useState<ApiKey[] | null>(null);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[] | null>(null);
  const [scraping, setScraping] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apiRef = useRef<ApiClient | null>(null);
  const mountedRef = useRef(true);

  // Track component lifetime for safe async state updates
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  async function loadData(api: ApiClient, isCancelled: () => boolean) {
    try {
      const [s, src, cfg, an, users, reqs, keys, runs] = await Promise.all([
        api.getStats(),
        api.getSources(),
        api.getConfig(),
        api.getAnalytics(),
        api.getTgUsers(),
        api.getApiRequests(),
        api.getApiKeys(),
        // Best-effort: si la ruta nueva falla, el admin carga igual.
        api.getScrapeRuns().catch(() => [] as ScrapeRun[]),
      ]);
      if (isCancelled()) return;
      setStats(s);
      setSources(src);
      setConfig(cfg);
      setAnalytics(an);
      setTgUsers(users);
      setApiRequests(reqs);
      setApiKeys(keys);
      setScrapeRuns(runs);
    } catch {
      if (!isCancelled()) setError("Error al cargar los datos.");
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    async function init() {
      try {
        const cfg = await loadRuntimeConfig();
        if (!mountedRef.current) return;
        configureAuth(cfg);
        const api = createApi(cfg.apiUrl, getIdToken);
        apiRef.current = api;
        const token = await getIdToken();
        if (!mountedRef.current) return;

        if (token) {
          setAuthed(true);
          await loadData(api, () => !mountedRef.current);
        } else {
          setAuthed(false);
        }
      } catch {
        if (mountedRef.current) setError("Error al inicializar la aplicación.");
      }
    }

    void init();
  }, []); // deps are injected at mount time and treated as stable refs

  async function handleAuthed() {
    const token = await getIdToken();
    if (token && apiRef.current) {
      setAuthed(true);
      await loadData(apiRef.current, () => !mountedRef.current);
    }
  }

  async function handleSignOut() {
    await signOutUser();
    setAuthed(false);
    setStats(null);
    setSources(null);
    setConfig(null);
    setAnalytics(null);
    setTgUsers(null);
    setApiRequests(null);
    setApiKeys(null);
    setScrapeRuns(null);
  }

  async function refreshApiProgram() {
    if (!apiRef.current) return;
    const [reqs, keys] = await Promise.all([
      apiRef.current.getApiRequests(),
      apiRef.current.getApiKeys(),
    ]);
    if (mountedRef.current) {
      setApiRequests(reqs);
      setApiKeys(keys);
    }
  }

  async function handleRefreshApiProgram() {
    setRefreshing(true);
    setError(null);
    try {
      await refreshApiProgram();
    } catch {
      if (mountedRef.current)
        setError("No se pudo actualizar el programa de API.");
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  async function handleApproveRequest(id: string) {
    if (!apiRef.current) throw new Error("API not initialized");
    const result = await apiRef.current.approveApiRequest(id);
    await refreshApiProgram();
    return result;
  }

  async function handleRejectRequest(id: string) {
    if (!apiRef.current) return;
    try {
      await apiRef.current.rejectApiRequest(id);
      await refreshApiProgram();
    } catch {
      if (mountedRef.current) setError("No se pudo rechazar la solicitud.");
    }
  }

  async function handleRevokeKey(id: string) {
    if (!apiRef.current) return;
    try {
      await apiRef.current.revokeApiKey(id);
      await refreshApiProgram();
    } catch {
      if (mountedRef.current) setError("No se pudo revocar la clave.");
    }
  }

  // Auto-dismiss the success notice so it doesn't linger.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 9000);
    return () => clearTimeout(t);
  }, [notice]);

  async function handleScrape() {
    if (!apiRef.current) return;
    setScraping(true);
    setNotice(null);
    setError(null);
    try {
      // The scraper runs asynchronously: the API returns 202 immediately and
      // extraction continues in the background. There is no "finished" signal,
      // so we confirm it started and point the user to the Dashboard refresh.
      await apiRef.current.scrapeNow();
      if (mountedRef.current) {
        setNotice(
          "Scrape iniciado. Corre en segundo plano (~1–2 min); luego usá «Actualizar» en el Dashboard para ver los datos nuevos.",
        );
      }
    } catch {
      if (mountedRef.current) setError("No se pudo iniciar el scrape.");
    } finally {
      if (mountedRef.current) setScraping(false);
    }
  }

  async function handleRefreshStats() {
    if (!apiRef.current) return;
    setRefreshing(true);
    setError(null);
    try {
      const [s, src, runs] = await Promise.all([
        apiRef.current.getStats(),
        apiRef.current.getSources(),
        apiRef.current.getScrapeRuns().catch(() => [] as ScrapeRun[]),
      ]);
      if (mountedRef.current) {
        setStats(s);
        setSources(src);
        setScrapeRuns(runs);
      }
    } catch {
      if (mountedRef.current) setError("No se pudieron actualizar los datos.");
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  async function handleRefreshAnalytics() {
    if (!apiRef.current) return;
    setRefreshing(true);
    setError(null);
    try {
      const an = await apiRef.current.getAnalytics();
      if (mountedRef.current) setAnalytics(an);
    } catch {
      if (mountedRef.current) setError("No se pudo actualizar la analítica.");
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  async function handleRefreshUsers() {
    if (!apiRef.current) return;
    setRefreshing(true);
    setError(null);
    try {
      const users = await apiRef.current.getTgUsers();
      if (mountedRef.current) setTgUsers(users);
    } catch {
      if (mountedRef.current) setError("No se pudo actualizar los usuarios.");
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  async function handleToggleBlock(u: TgUser) {
    if (!apiRef.current) return;
    setBusyBlockChatId(u.chatId);
    setError(null);
    try {
      await apiRef.current.setTgUserBlocked(u.chatId, !u.blocked);
      const users = await apiRef.current.getTgUsers();
      if (mountedRef.current) setTgUsers(users);
    } catch {
      if (mountedRef.current) {
        setError("No se pudo actualizar el bloqueo del usuario.");
      }
    } finally {
      if (mountedRef.current) setBusyBlockChatId(undefined);
    }
  }

  async function refreshSources() {
    if (!apiRef.current) return;
    const updated = await apiRef.current.getSources();
    if (mountedRef.current) setSources(updated);
  }

  async function handleToggleSource(id: string, enabled: boolean) {
    if (!apiRef.current) return;
    try {
      await apiRef.current.patchSource(id, enabled);
      await refreshSources();
    } catch {
      if (mountedRef.current) setError("No se pudo actualizar la fuente.");
    }
  }

  function handleCreateSource(body: {
    nombre: string;
    url: string;
    extractHint?: string;
  }) {
    if (!apiRef.current)
      return Promise.reject(new Error("API not initialized"));
    const api = apiRef.current;
    setCreating(true);
    return api
      .createSource(body)
      .then(() => refreshSources())
      .catch((e) => {
        if (mountedRef.current) setError("No se pudo agregar la fuente.");
        throw e;
      })
      .finally(() => {
        if (mountedRef.current) setCreating(false);
      });
  }

  function handleCreateRestSource(body: {
    nombre: string;
    url: string;
    rest: import("@/types").RestConfig;
  }) {
    if (!apiRef.current)
      return Promise.reject(new Error("API not initialized"));
    const api = apiRef.current;
    setCreating(true);
    return api
      .createRestSource(body)
      .then(() => refreshSources())
      .catch((e) => {
        if (mountedRef.current) setError("No se pudo agregar la fuente API.");
        throw e;
      })
      .finally(() => {
        if (mountedRef.current) setCreating(false);
      });
  }

  function handleProbe(rest: import("@/types").RestConfig) {
    if (!apiRef.current)
      return Promise.reject(new Error("API not initialized"));
    return apiRef.current.probeSource(rest);
  }

  function handleDeleteSource(id: string) {
    if (!apiRef.current) return;
    const api = apiRef.current;
    api
      .deleteSource(id)
      .then(() => refreshSources())
      .catch(() => {
        if (mountedRef.current) setError("No se pudo eliminar la fuente.");
      });
  }

  async function handleSaveConfig(next: ConfigType) {
    if (!apiRef.current) return;
    setSaving(true);
    try {
      const updated = await apiRef.current.putConfig(next);
      if (mountedRef.current) setConfig(updated);
    } catch {
      if (mountedRef.current) setError("No se pudo guardar la configuración.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  if (authed === null) {
    return (
      <div className={styles.init} role="status" aria-live="polite">
        Cargando…
      </div>
    );
  }

  if (!authed) {
    return <Login onAuthed={() => void handleAuthed()} />;
  }

  const TAB_LABELS: Record<Tab, string> = {
    dashboard: "Dashboard",
    analytics: "Analítica",
    users: "Usuarios",
    search: "Buscar",
    sources: "Fuentes",
    config: "Config",
    api: "API",
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.title}>VenezuelaHelp · Admin</span>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={styles.signOutButton}
        >
          Cerrar sesión
        </button>
      </header>

      <nav className={styles.nav} aria-label="Navegación principal">
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={styles.navButton}
            aria-current={activeTab === tab ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div role="alert" className={styles.errorBanner}>
          {error}
        </div>
      )}

      {notice && (
        <div role="status" aria-live="polite" className={styles.noticeBanner}>
          {notice}
        </div>
      )}

      <main className={styles.main}>
        {activeTab === "dashboard" &&
          (stats ? (
            <Dashboard
              stats={stats}
              onRefresh={() => void handleRefreshStats()}
              refreshing={refreshing}
              scrapeRateMin={config?.scrapeRateMin}
              scrapeRuns={scrapeRuns}
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando datos…
            </div>
          ))}

        {activeTab === "analytics" &&
          (analytics ? (
            <Analytics
              data={analytics}
              onRefresh={() => void handleRefreshAnalytics()}
              refreshing={refreshing}
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando analítica…
            </div>
          ))}

        {activeTab === "users" &&
          (tgUsers ? (
            <Users
              users={tgUsers}
              onRefresh={() => void handleRefreshUsers()}
              refreshing={refreshing}
              onToggleBlock={(u) => void handleToggleBlock(u)}
              busyChatId={busyBlockChatId}
              onLoadQa={(chatId) =>
                apiRef.current
                  ? apiRef.current.getQaLogs(chatId)
                  : Promise.reject(new Error("API not initialized"))
              }
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando usuarios…
            </div>
          ))}

        {activeTab === "search" && (
          <Search
            onSearch={(p) =>
              apiRef.current
                ? apiRef.current.searchItems(p)
                : Promise.reject(new Error("API not initialized"))
            }
            sources={sources}
          />
        )}

        {activeTab === "sources" &&
          (sources ? (
            <Sources
              sources={sources}
              onToggle={(id, enabled) => void handleToggleSource(id, enabled)}
              onScrape={() => void handleScrape()}
              scraping={scraping}
              onCreate={handleCreateSource}
              onCreateRest={handleCreateRestSource}
              onProbe={handleProbe}
              onDelete={handleDeleteSource}
              creating={creating}
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando fuentes…
            </div>
          ))}

        {activeTab === "api" &&
          (apiRequests && apiKeys ? (
            <ApiRequests
              requests={apiRequests}
              keys={apiKeys}
              onApprove={handleApproveRequest}
              onReject={(id) => void handleRejectRequest(id)}
              onRevoke={(id) => void handleRevokeKey(id)}
              onRefresh={() => void handleRefreshApiProgram()}
              refreshing={refreshing}
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando programa de API…
            </div>
          ))}

        {activeTab === "config" &&
          (config ? (
            <Config
              config={config}
              onSave={(next) => void handleSaveConfig(next)}
              saving={saving}
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando configuración…
            </div>
          ))}
      </main>
    </div>
  );
}

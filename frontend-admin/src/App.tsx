import { useState, useEffect, useRef } from "react";
import { Login } from "@/components/Login";
import { Dashboard } from "@/components/Dashboard";
import { Sources } from "@/components/Sources";
import { Config } from "@/components/Config";
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
import type { Config as ConfigType, Source, Stats } from "@/types";
import styles from "./App.module.css";

type ApiClient = ReturnType<typeof defaultCreateApi>;
type Tab = "dashboard" | "sources" | "config";

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
  const [sources, setSources] = useState<Source[] | null>(null);
  const [config, setConfig] = useState<ConfigType | null>(null);
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiRef = useRef<ApiClient | null>(null);

  async function loadData(api: ApiClient) {
    try {
      const [s, src, cfg] = await Promise.all([
        api.getStats(),
        api.getSources(),
        api.getConfig(),
      ]);
      setStats(s);
      setSources(src);
      setConfig(cfg);
    } catch {
      setError("Error al cargar los datos.");
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const cfg = await loadRuntimeConfig();
        if (cancelled) return;
        configureAuth(cfg);
        const api = createApi(cfg.apiUrl, getIdToken);
        apiRef.current = api;
        const token = await getIdToken();
        if (cancelled) return;

        if (token) {
          setAuthed(true);
          await loadData(api);
        } else {
          setAuthed(false);
        }
      } catch {
        if (!cancelled) setError("Error al inicializar la aplicación.");
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []); // deps are injected at mount time and treated as stable refs

  async function handleAuthed() {
    const token = await getIdToken();
    if (token && apiRef.current) {
      setAuthed(true);
      await loadData(apiRef.current);
    }
  }

  async function handleSignOut() {
    await signOutUser();
    setAuthed(false);
    setStats(null);
    setSources(null);
    setConfig(null);
  }

  async function handleScrape() {
    if (!apiRef.current) return;
    setScraping(true);
    try {
      await apiRef.current.scrapeNow();
    } finally {
      setScraping(false);
    }
  }

  async function handleToggleSource(id: string, enabled: boolean) {
    if (!apiRef.current) return;
    await apiRef.current.patchSource(id, enabled);
    const updated = await apiRef.current.getSources();
    setSources(updated);
  }

  async function handleSaveConfig(next: ConfigType) {
    if (!apiRef.current) return;
    setSaving(true);
    try {
      const updated = await apiRef.current.putConfig(next);
      setConfig(updated);
    } finally {
      setSaving(false);
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
    sources: "Fuentes",
    config: "Config",
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

      <main className={styles.main}>
        {activeTab === "dashboard" &&
          (stats ? (
            <Dashboard stats={stats} />
          ) : (
            <div className={styles.loading} role="status">
              Cargando datos…
            </div>
          ))}

        {activeTab === "sources" &&
          (sources ? (
            <Sources
              sources={sources}
              onToggle={(id, enabled) => void handleToggleSource(id, enabled)}
              onScrape={() => void handleScrape()}
              scraping={scraping}
            />
          ) : (
            <div className={styles.loading} role="status">
              Cargando fuentes…
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

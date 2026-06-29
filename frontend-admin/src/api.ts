import type {
  Config,
  Source,
  Stats,
  Analytics,
  TgUser,
  RestConfig,
  ProbeResult,
} from "@/types";

interface ApiDeps {
  fetch?: typeof fetch;
}

interface Api {
  getConfig(): Promise<Config>;
  putConfig(cfg: Config): Promise<Config>;
  getSources(): Promise<Source[]>;
  patchSource(id: string, enabled: boolean): Promise<Source>;
  scrapeNow(): Promise<void>;
  getStats(): Promise<Stats>;
  createSource(body: {
    nombre: string;
    url: string;
    extractHint?: string;
  }): Promise<Source>;
  createRestSource(body: {
    nombre: string;
    url: string;
    rest: RestConfig;
  }): Promise<Source>;
  updateSourceConfig(id: string, rest: RestConfig): Promise<Source>;
  probeSource(rest: RestConfig): Promise<ProbeResult>;
  deleteSource(id: string): Promise<void>;
  getAnalytics(): Promise<Analytics>;
  getTgUsers(): Promise<TgUser[]>;
}

export function createApi(
  apiUrl: string,
  getToken: () => Promise<string | null>,
  deps: ApiDeps = {},
): Api {
  const fetcher = deps.fetch ?? fetch;

  async function request<T>(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetcher(`${apiUrl}${path}`, init);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    getConfig(): Promise<Config> {
      return request<Config>("/config", "GET");
    },

    putConfig(cfg: Config): Promise<Config> {
      return request<Config>("/config", "PUT", cfg);
    },

    getSources(): Promise<Source[]> {
      return request<Source[]>("/sources", "GET");
    },

    patchSource(id: string, enabled: boolean): Promise<Source> {
      return request<Source>(`/sources/${id}`, "PATCH", { enabled });
    },

    async scrapeNow(): Promise<void> {
      await request<unknown>("/scrape", "POST");
    },

    getStats(): Promise<Stats> {
      return request<Stats>("/stats", "GET");
    },

    createSource(body: {
      nombre: string;
      url: string;
      extractHint?: string;
    }): Promise<Source> {
      return request<Source>("/sources", "POST", body);
    },

    createRestSource(body: {
      nombre: string;
      url: string;
      rest: RestConfig;
    }): Promise<Source> {
      return request<Source>("/sources", "POST", { tipo: "rest", ...body });
    },

    updateSourceConfig(id: string, rest: RestConfig): Promise<Source> {
      return request<Source>(`/sources/${encodeURIComponent(id)}`, "PATCH", {
        rest,
      });
    },

    probeSource(rest: RestConfig): Promise<ProbeResult> {
      return request<ProbeResult>("/sources/probe", "POST", { rest });
    },

    async deleteSource(id: string): Promise<void> {
      await request<unknown>(`/sources/${encodeURIComponent(id)}`, "DELETE");
    },

    getAnalytics(): Promise<Analytics> {
      return request<Analytics>("/analytics", "GET");
    },

    getTgUsers(): Promise<TgUser[]> {
      return request<TgUser[]>("/tg-users", "GET");
    },
  };
}

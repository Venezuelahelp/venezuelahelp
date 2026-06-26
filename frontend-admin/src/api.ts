import type { Config, Source, Stats } from "@/types";

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
  deleteSource(id: string): Promise<void>;
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

    async deleteSource(id: string): Promise<void> {
      await request<unknown>(`/sources/${id}`, "DELETE");
    },
  };
}

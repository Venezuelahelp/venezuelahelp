export interface RuntimeConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const url = import.meta.env.VITE_CONFIG_URL ?? "/config.json";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load runtime config: ${response.status}`);
  }
  return response.json() as Promise<RuntimeConfig>;
}

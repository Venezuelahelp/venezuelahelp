export async function fetchJson<T>(
  url: string,
  timeoutMs = 15000,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "VenezuelaHelp/1.0",
        ...headers,
      },
    });
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

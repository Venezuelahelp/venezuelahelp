// Cliente del intake de solicitudes de acceso al API público. Llama al API de
// terceros (dominio propio api.<dominio>), CORS. El solicitante aún no tiene
// key, así que este endpoint es público (sin x-api-key).
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "https://api.venezuelahelp.click";

export interface ApiAccessForm {
  nombre: string;
  email: string;
  organizacion?: string;
  motivo: string;
  descripcion?: string;
  aceptaTerminos: true;
}

export async function submitApiAccessRequest(
  form: ApiAccessForm,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const res = await fetcher(`${API_BASE}/api-access/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

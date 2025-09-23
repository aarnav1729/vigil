// src/lib/api.ts
/**
 * API_BASE resolution rules:
 * 1. Use VITE_VIGIL_API (if provided) -- recommended for dev/prod
 * 2. Else use empty string which makes fetch use a relative URL (same origin)
 *
 * This prevents accidental absolute-origin redirects when you only want the client
 * to call relative `/api/...` endpoints on the same host.
 */

function trimTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

// Prefer Vite env. If unset, use relative path (same origin).
// Set VITE_VIGIL_API in .env.[mode] like: https://vigil.my-domain.com
const envApi =
  (import.meta as any)?.env?.VITE_VIGIL_API &&
  String((import.meta as any).env.VITE_VIGIL_API).trim();
export const API_BASE = envApi ? trimTrailingSlash(envApi) : "";
/**
 * Build a proper URL from API_BASE and a path.
 * Accepts both "/api/..." and "api/..." style path inputs.
 */
function makeUrl(path: string) {
  if (!path) return API_BASE || "/";
  // ensure path begins with a single slash
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // if API_BASE is empty -> relative path
  return API_BASE ? `${API_BASE}${normalizedPath}` : `${normalizedPath}`;
}

export async function api<T = any>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = makeUrl(path);

  // small development warning to show where requests go (only logs in dev)
  if (
    import.meta.env &&
    (import.meta.env.MODE === "development" ||
      (import.meta as any).env?.VITE_DEBUG_API === "true")
  ) {
    // eslint-disable-next-line no-console
    console.debug(`[api] ${init?.method || "GET"} -> ${url}`);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => null);
    throw new Error(
      `API ${res.status} ${res.statusText}${text ? " - " + text : ""}`
    );
  }
  return (await res.json()) as T;
}

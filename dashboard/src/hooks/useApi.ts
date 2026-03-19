import { useState, useEffect, useCallback } from "react";

// ── API Key management (legacy — kept for SSE EventSource) ───────────────
// The dashboard API key is passed via ?key= in the dashboard URL.
// Once loaded, it's cached in sessionStorage for the tab lifetime.

function getApiKey(): string {
  const cached = sessionStorage.getItem("vec-api-key");
  if (cached) return cached;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("key") ?? params.get("KEY") ?? "";
  if (fromUrl) {
    sessionStorage.setItem("vec-api-key", fromUrl);
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, "", cleanUrl);
    return fromUrl;
  }

  return "";
}

/** Build a URL with the API key as query param (for SSE EventSource only). */
export function apiUrl(path: string): string {
  const key = getApiKey();
  if (!key) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}key=${encodeURIComponent(key)}`;
}

/** Check if we have a legacy API key configured. */
export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

// ── Cookie-based auth fetch with auto-refresh ────────────────────────────

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...options, credentials: "include" });

  if (res.status === 401) {
    // Try refreshing the access token
    const refreshRes = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      // Retry with the new cookie
      return fetch(url, { ...options, credentials: "include" });
    }

    // Refresh failed — session expired
    window.dispatchEvent(new CustomEvent("vec:auth-expired"));
    throw new Error("Session expired");
  }

  return res;
}

// Proactive token refresh — every 50 min (before 1h expiry)
let _refreshTimer: ReturnType<typeof setInterval> | null = null;
export function startTokenRefresh() {
  if (_refreshTimer) return;
  _refreshTimer = setInterval(() => {
    fetch("/api/auth/refresh", { method: "POST", credentials: "include" }).catch(() => {});
  }, 50 * 60 * 1000);
}

export function stopTokenRefresh() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

// ── Polling hook ──────────────────────────────────────────────────────────

export function usePolling<T>(url: string, interval = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [refresh, interval]);

  return { data, loading, error, lastRefresh, refresh };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

export async function postApi(url: string, body: unknown) {
  const res = await authFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function patchApi(url: string, body: unknown) {
  const res = await authFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteApi(url: string) {
  const res = await authFetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

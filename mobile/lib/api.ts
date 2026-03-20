import EncryptedStorage from "react-native-encrypted-storage";

// ── Credentials ─────────────────────────────────────────────────────────────
let _serverUrl = "";
let _apiKey = "";
let _relayMode = false;
let _relaySecret = "";
let _sessionId = "default";

export async function getServerUrl(): Promise<string> {
  if (_serverUrl) return _serverUrl;
  _serverUrl = (await EncryptedStorage.getItem("server_url")) ?? "";
  return _serverUrl;
}

export async function getApiKey(): Promise<string> {
  if (_apiKey) return _apiKey;
  _apiKey = (await EncryptedStorage.getItem("api_key")) ?? "";
  return _apiKey;
}

export async function getRelayMode(): Promise<boolean> {
  if (_relayMode) return true;
  _relayMode = (await EncryptedStorage.getItem("relay_mode")) === "true";
  _relaySecret = (await EncryptedStorage.getItem("relay_secret")) ?? "";
  _sessionId = (await EncryptedStorage.getItem("relay_session")) ?? "default";
  return _relayMode;
}

export async function isLoggedIn(): Promise<boolean> {
  const url = await getServerUrl();
  const relay = await getRelayMode();
  if (relay) return !!(url && _relaySecret);
  const key = await getApiKey();
  return !!(url && key);
}

// ── Login ───────────────────────────────────────────────────────────────────

export async function login(serverUrl: string, key: string): Promise<{ ok: boolean; error?: string }> {
  const base = serverUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    _serverUrl = base;
    _apiKey = key;
    _relayMode = false;
    await EncryptedStorage.setItem("server_url", base);
    await EncryptedStorage.setItem("api_key", key);
    await EncryptedStorage.setItem("relay_mode", "false");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Connection failed" };
  }
}

export async function loginRelay(relayUrl: string, secret: string, session: string): Promise<{ ok: boolean; error?: string }> {
  const base = relayUrl.replace(/\/+$/, "");
  try {
    // Check relay health and PC connection
    const res = await fetch(`${base}/status`, {
      headers: { "X-Relay-Secret": secret, "X-Session-Id": session || "default" },
    });
    if (!res.ok) return { ok: false, error: "Invalid relay secret" };
    const data = await res.json();
    if (!data.connected) return { ok: false, error: "PC is not connected to relay. Start OCTO VEC with relay enabled." };

    _serverUrl = base;
    _relaySecret = secret;
    _sessionId = session || "default";
    _relayMode = true;
    _apiKey = "";
    await EncryptedStorage.setItem("server_url", base);
    await EncryptedStorage.setItem("relay_secret", secret);
    await EncryptedStorage.setItem("relay_session", _sessionId);
    await EncryptedStorage.setItem("relay_mode", "true");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? "Connection failed" };
  }
}

export async function logout() {
  _serverUrl = "";
  _apiKey = "";
  _relayMode = false;
  _relaySecret = "";
  _sessionId = "default";
  await EncryptedStorage.removeItem("server_url");
  await EncryptedStorage.removeItem("api_key");
  await EncryptedStorage.removeItem("relay_mode");
  await EncryptedStorage.removeItem("relay_secret");
  await EncryptedStorage.removeItem("relay_session");
}

// ── Fetch with auth ─────────────────────────────────────────────────────────

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const base = await getServerUrl();
  const relay = await getRelayMode();

  if (relay) {
    // Relay mode: /relay/api/... with X-Relay-Secret header
    return fetch(`${base}/relay${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Secret": _relaySecret,
        "X-Session-Id": _sessionId,
        ...options.headers,
      },
    });
  } else {
    // Direct mode: append ?key= to URL
    const key = await getApiKey();
    const sep = path.includes("?") ? "&" : "?";
    return fetch(`${base}${path}${sep}key=${encodeURIComponent(key)}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  }
}

export async function getApi<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function postApi<T = any>(path: string, body: unknown): Promise<T> {
  const res = await authFetch(path, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── SSE for typing indicators ───────────────────────────────────────────────

export type StreamCallback = (event: {
  agentId: string;
  type: string;
  content: string;
}) => void;

export function createSSEStream(onEvent: StreamCallback): () => void {
  let aborted = false;

  (async () => {
    const base = await getServerUrl();
    const relay = await getRelayMode();

    if (!base) return;

    while (!aborted) {
      try {
        let url: string;
        let headers: Record<string, string> = { Accept: "text/event-stream" };

        if (relay) {
          url = `${base}/relay/stream`;
          headers["X-Relay-Secret"] = _relaySecret;
          headers["X-Session-Id"] = _sessionId;
        } else {
          const key = await getApiKey();
          url = `${base}/api/stream?key=${encodeURIComponent(key)}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok || !res.body) break;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try { onEvent(JSON.parse(line.slice(6))); } catch {}
            }
          }
        }
      } catch {
        if (!aborted) await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();

  return () => { aborted = true; };
}

import EncryptedStorage from "react-native-encrypted-storage";
import { Platform } from "react-native";

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

// Hydrate all cached vars from storage (call once on app start)
export async function hydrateAuth(): Promise<void> {
  _serverUrl = (await EncryptedStorage.getItem("server_url")) ?? "";
  _apiKey = (await EncryptedStorage.getItem("api_key")) ?? "";
  _relayMode = (await EncryptedStorage.getItem("relay_mode")) === "true";
  _relaySecret = (await EncryptedStorage.getItem("relay_secret")) ?? "";
  _sessionId = (await EncryptedStorage.getItem("relay_session")) ?? "default";
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
  // Close WebSocket on logout
  if (_ws) { try { _ws.close(); } catch {} _ws = null; }
  _wsListeners.clear();
  await EncryptedStorage.removeItem("server_url");
  await EncryptedStorage.removeItem("api_key");
  await EncryptedStorage.removeItem("relay_mode");
  await EncryptedStorage.removeItem("relay_secret");
  await EncryptedStorage.removeItem("relay_session");
}

// ── Device unlink listener ──────────────────────────────────────────────────

let _onDeviceUnlinked: (() => void) | null = null;

/** Register a callback that fires when the server reports this device was unlinked. */
export function onDeviceUnlinked(cb: () => void) { _onDeviceUnlinked = cb; }

// ── Fetch with auth ─────────────────────────────────────────────────────────

const _deviceInfo = `${Platform.OS === "android" ? "Android" : "iOS"} ${Platform.Version}`;
const _deviceName = `${Platform.OS === "android" ? "Android" : "iPhone"}`;

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const base = await getServerUrl();
  if (!base) throw new Error("Not logged in");
  const relay = await getRelayMode();

  const deviceHeaders: Record<string, string> = {
    "X-Device-Platform": Platform.OS,
    "X-Device-Info": _deviceInfo,
    "X-Device-Name": _deviceName,
  };

  let res: Response;
  if (relay) {
    res = await fetch(`${base}/relay${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Secret": _relaySecret || "",
        "X-Session-Id": _sessionId || "default",
        ...deviceHeaders,
        ...options.headers,
      },
    });
  } else {
    const key = await getApiKey();
    const sep = (path || "").includes("?") ? "&" : "?";
    res = await fetch(`${base}${path}${sep}key=${encodeURIComponent(key)}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...deviceHeaders, ...options.headers },
    });
  }

  // Detect device unlinked — server returns 403 with { error: "device_unlinked" }
  if (res.status === 403) {
    try {
      const body = await res.clone().json();
      if (body?.error === "device_unlinked") {
        await logout();
        if (_onDeviceUnlinked) _onDeviceUnlinked();
        throw new Error("Device unlinked");
      }
    } catch (e: any) {
      if (e?.message === "Device unlinked") throw e;
    }
  }

  return res;
}

export async function getApi<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function postApi<T = any>(path: string, body: unknown): Promise<T> {
  const res = await authFetch(path, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${errBody}`);
  }
  return res.json();
}

// ── WebSocket real-time stream ───────────────────────────────────────────────

export type StreamEvent = {
  agentId: string;
  type: string;
  content: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: string;
  isError?: boolean;
  taskId?: string;
  todos?: any[];
};

export type StreamCallback = (event: StreamEvent) => void;

// Singleton WebSocket connection shared across all screens
let _ws: WebSocket | null = null;
let _wsListeners: Set<StreamCallback> = new Set();
let _wsConnecting = false;
let _wsDebug = "init";
let _wsMsgCount = 0;
export function getWsDebug() { return `${_wsDebug} | msgs:${_wsMsgCount} | listeners:${_wsListeners.size}`; }

async function ensureWebSocket(): Promise<void> {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === 1)) return;
  if (_wsConnecting) return;
  _wsConnecting = true;

  const base = await getServerUrl();
  if (!base) { _wsConnecting = false; return; }

  const wsBase = base.replace(/^http/, "ws");
  const relay = await getRelayMode();

  let url: string;
  if (relay) {
    url = `${wsBase}/ws?secret=${encodeURIComponent(_relaySecret)}&session=${encodeURIComponent(_sessionId)}&client=mobile`;
  } else {
    url = `${wsBase}/ws?key=${encodeURIComponent(_apiKey)}`;
  }

  try {
    const ws = new WebSocket(url);

    _wsDebug = "connecting:" + url.replace(/secret=[^&]+/, "***").replace(/key=[^&]+/, "***");

    ws.onopen = () => {
      _ws = ws;
      _wsConnecting = false;
      _wsDebug = "open";
      _wsMsgCount = 0;
    };

    ws.onmessage = (event: any) => {
      _wsMsgCount++;
      try {
        const raw = event?.data ?? event;
        const str = typeof raw === "string" ? raw : typeof raw === "object" && raw !== null ? JSON.stringify(raw) : String(raw);
        if (!str || str === "undefined") return;
        const msg = JSON.parse(str);
        if (msg.channel === "stream" && msg.data) {
          _wsDebug = "stream:" + (msg.data.agentId || "?") + ":" + (msg.data.type || "?");
          for (const cb of _wsListeners) {
            try { cb(msg.data); } catch {}
          }
        } else if (msg.channel === "ping") {
          _wsDebug = "open(ping)";
        }
      } catch (e: any) {
        _wsDebug = "parse_err:" + (e?.message || "unknown");
      }
    };

    ws.onerror = (e: any) => {
      _wsConnecting = false;
      _wsDebug = "error:" + (e?.message || "unknown");
    };

    ws.onclose = (e: any) => {
      _ws = null;
      _wsConnecting = false;
      _wsDebug = "closed:" + (e?.code || "?");
      // Always auto-reconnect — WS stays alive for the app lifetime
      setTimeout(() => ensureWebSocket(), 3000);
    };
  } catch {
    _wsConnecting = false;
  }
}

/** Subscribe to real-time stream events via WebSocket. Returns unsubscribe function. */
export function subscribeStream(onEvent: StreamCallback): () => void {
  _wsListeners.add(onEvent);
  ensureWebSocket();

  return () => {
    _wsListeners.delete(onEvent);
    // Keep WebSocket alive — don't close on unsubscribe.
    // It auto-reconnects and stays ready for the next subscribe.
  };
}

// Keep backward compat alias
export const createSSEStream = subscribeStream;

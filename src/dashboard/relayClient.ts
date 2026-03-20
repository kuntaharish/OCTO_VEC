/**
 * OCTO VEC Relay Client
 * Connects outbound to the relay server and proxies API requests to the local dashboard.
 * No inbound ports needed — all connections are outbound.
 */

import WebSocket from "ws";
import http from "http";

interface RelayConfig {
  relayUrl: string;     // e.g. "wss://your-vps.com" or "ws://your-vps:8080"
  relaySecret: string;  // shared secret
  sessionId: string;    // session identifier (default: "default")
  localPort: number;    // local dashboard port
  localApiKey: string;  // dashboard API key for local requests
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function makeLocalRequest(cfg: RelayConfig, method: string, path: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const sep = path.includes("?") ? "&" : "?";
    const fullPath = `${path}${sep}key=${encodeURIComponent(cfg.localApiKey)}`;

    const req = http.request({
      hostname: "127.0.0.1",
      port: cfg.localPort,
      path: fullPath,
      method,
      headers: { "Content-Type": "application/json" },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 200, body: data }));
    });

    req.on("error", () => resolve({ status: 502, body: JSON.stringify({ error: "local dashboard unreachable" }) }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: 504, body: JSON.stringify({ error: "local timeout" }) }); });

    if (body && method !== "GET" && method !== "HEAD") req.write(body);
    req.end();
  });
}

// Handle SSE: open a local SSE stream and forward events to relay
function handleSSEOpen(cfg: RelayConfig, sseId: string) {
  const sep = "/api/stream".includes("?") ? "&" : "?";
  const fullPath = `/api/stream${sep}key=${encodeURIComponent(cfg.localApiKey)}`;

  const req = http.request({
    hostname: "127.0.0.1",
    port: cfg.localPort,
    path: fullPath,
    method: "GET",
    headers: { Accept: "text/event-stream" },
  }, (res) => {
    res.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ") && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "sse_event", sseId, data: line.slice(6) }));
        }
      }
    });
    res.on("end", () => {});
  });

  req.on("error", () => {});
  req.end();

  // Store so we can abort on sse_close
  if (!ws) return;
  if (!(ws as any)._sseStreams) (ws as any)._sseStreams = new Map();
  (ws as any)._sseStreams.set(sseId, req);
}

function handleSSEClose(sseId: string) {
  if (ws && (ws as any)._sseStreams) {
    const req = (ws as any)._sseStreams.get(sseId);
    if (req) { req.destroy(); (ws as any)._sseStreams.delete(sseId); }
  }
}

function connect(cfg: RelayConfig) {
  if (stopped) return;

  const wsUrl = `${cfg.relayUrl}/ws?secret=${encodeURIComponent(cfg.relaySecret)}&session=${encodeURIComponent(cfg.sessionId)}`;

  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log(`  [Relay] Connected to relay server`);
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  });

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "http_request" && msg.id) {
        const result = await makeLocalRequest(cfg, msg.method, msg.path, msg.body);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "http_response",
            id: msg.id,
            status: result.status,
            body: result.body,
          }));
        }
      }

      if (msg.type === "sse_open" && msg.sseId) {
        handleSSEOpen(cfg, msg.sseId);
      }

      if (msg.type === "sse_close" && msg.sseId) {
        handleSSEClose(msg.sseId);
      }
    } catch {}
  });

  ws.on("close", () => {
    console.log("  [Relay] Disconnected, reconnecting in 3s...");
    scheduleReconnect(cfg);
  });

  ws.on("error", () => {
    scheduleReconnect(cfg);
  });
}

function scheduleReconnect(cfg: RelayConfig) {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(cfg);
  }, 3000);
}

export function startRelayClient(cfg: RelayConfig): () => void {
  stopped = false;
  console.log(`  [Relay] Connecting to ${cfg.relayUrl} (session: ${cfg.sessionId})...`);
  connect(cfg);

  return () => {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (ws) { ws.close(); ws = null; }
  };
}

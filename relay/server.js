const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "8080", 10);
const RELAY_SECRET = process.env.RELAY_SECRET || "";
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB limit

if (!RELAY_SECRET) {
  console.error("ERROR: Set RELAY_SECRET env variable (shared secret between relay, PC, and phone)");
  process.exit(1);
}

// Timing-safe secret comparison to prevent timing attacks
function verifySecret(input) {
  if (!input || typeof input !== "string") return false;
  try {
    const a = Buffer.from(input, "utf-8");
    const b = Buffer.from(RELAY_SECRET, "utf-8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── State ───────────────────────────────────────────────────────────────────
const pcSessions = new Map();
const pendingRequests = new Map();
const mobileClients = new Map(); // sessionId → Set<WebSocket>

// ── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS for mobile
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Relay-Secret, X-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check (no auth needed, doesn't expose secrets)
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Status: check if a PC session is connected
  if (req.url === "/status") {
    const secret = req.headers["x-relay-secret"];
    if (!verifySecret(secret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const sessionId = req.headers["x-session-id"] || "default";
    const pc = pcSessions.get(sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ connected: !!(pc && pc.readyState === 1) }));
    return;
  }

  // ── SSE stream endpoint ──────────────────────────────────────────────────
  if (req.url?.startsWith("/relay/stream")) {
    const secret = req.headers["x-relay-secret"];
    const sessionId = req.headers["x-session-id"] || "default";

    if (!verifySecret(secret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const pc = pcSessions.get(sessionId);
    if (!pc || pc.readyState !== 1) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "PC not connected" }));
      return;
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const sseId = crypto.randomUUID();
    if (!pc._sseClients) pc._sseClients = new Map();
    pc._sseClients.set(sseId, res);

    pc.send(JSON.stringify({ type: "sse_open", sseId }));

    req.on("close", () => {
      if (pc._sseClients) pc._sseClients.delete(sseId);
      try { pc.send(JSON.stringify({ type: "sse_close", sseId })); } catch {}
    });

    return;
  }

  // ── Relay API requests: /relay/* → PC ────────────────────────────────────
  if (req.url?.startsWith("/relay/")) {
    const secret = req.headers["x-relay-secret"];
    const sessionId = req.headers["x-session-id"] || "default";

    if (!verifySecret(secret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const pc = pcSessions.get(sessionId);
    if (!pc || pc.readyState !== 1) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "PC not connected" }));
      return;
    }

    // Collect body with size limit
    let body = "";
    let bodySize = 0;
    req.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "request too large" }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (bodySize > MAX_BODY_SIZE) return;

      const requestId = crypto.randomUUID();
      const actualPath = req.url.replace(/^\/relay/, "");

      pc.send(JSON.stringify({
        type: "http_request",
        id: requestId,
        method: req.method,
        path: actualPath,
        body: body || undefined,
      }));

      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        if (!res.writableEnded) {
          res.writeHead(504, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "PC did not respond in time" }));
        }
      }, 30000);

      pendingRequests.set(requestId, { res, timer });
    });
    return;
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

// ── Single WebSocket server — distinguishes PC vs mobile by query param ─────
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const secret = url.searchParams.get("secret");
  const sessionId = url.searchParams.get("session") || "default";
  const isMobile = url.searchParams.get("client") === "mobile";

  if (!verifySecret(secret)) {
    ws.close(4001, "unauthorized");
    return;
  }

  // ── Mobile client ──────────────────────────────────────────────────────
  if (isMobile) {
    ws._ready = false;
    if (!mobileClients.has(sessionId)) mobileClients.set(sessionId, new Set());
    mobileClients.get(sessionId).add(ws);
    console.log(`[relay] Mobile connected: session=${sessionId} (${mobileClients.get(sessionId).size} mobile clients)`);
    // Skip replay: mark ready after 2s so old SSE events are ignored
    setTimeout(() => { ws._ready = true; }, 2000);

    // If PC is connected, open an SSE stream so we get events to forward
    const pc = pcSessions.get(sessionId);
    if (pc && pc.readyState === 1 && !pc._mobileSSEId) {
      const sseId = crypto.randomUUID();
      pc._mobileSSEId = sseId;
      if (!pc._sseClients) pc._sseClients = new Map();
      pc.send(JSON.stringify({ type: "sse_open", sseId }));
    }

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ channel: "ping" }));
    }, 15000);

    ws.on("close", () => {
      clearInterval(heartbeat);
      const set = mobileClients.get(sessionId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          mobileClients.delete(sessionId);
          const pc = pcSessions.get(sessionId);
          if (pc && pc._mobileSSEId) {
            try { pc.send(JSON.stringify({ type: "sse_close", sseId: pc._mobileSSEId })); } catch {}
            pc._mobileSSEId = null;
          }
        }
      }
    });
    ws.on("error", () => {});
    return;
  }

  // ── PC client ──────────────────────────────────────────────────────────
  const old = pcSessions.get(sessionId);
  if (old && old.readyState === 1) old.close(4002, "replaced");

  pcSessions.set(sessionId, ws);
  console.log(`[relay] PC connected: session=${sessionId}`);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "http_response" && msg.id) {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.id);
          if (!pending.res.writableEnded) {
            pending.res.writeHead(msg.status || 200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            pending.res.end(typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body));
          }
        }
      }

      if (msg.type === "sse_event" && msg.sseId) {
        // Forward to SSE HTTP clients
        if (ws._sseClients) {
          const sseRes = ws._sseClients.get(msg.sseId);
          if (sseRes && !sseRes.writableEnded) {
            sseRes.write(`data: ${typeof msg.data === "string" ? msg.data : JSON.stringify(msg.data)}\n\n`);
          }
        }
        // Forward to all mobile WebSocket clients for this session
        const mobiles = mobileClients.get(sessionId);
        if (mobiles) {
          try {
            const parsed = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
            const payload = JSON.stringify({ channel: "stream", data: parsed });
            for (const mws of mobiles) {
              if (mws.readyState === 1 && mws._ready) try { mws.send(payload); } catch {}
            }
          } catch {}
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    if (pcSessions.get(sessionId) === ws) {
      pcSessions.delete(sessionId);
      console.log(`[relay] PC disconnected: session=${sessionId}`);
    }
  });

  ws.on("error", () => {});
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[relay] OCTO VEC Relay running on port ${PORT}`);
  console.log(`[relay] Waiting for PC connections...`);
});

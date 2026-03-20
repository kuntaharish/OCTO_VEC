import notifee, { AndroidImportance } from "@notifee/react-native";
import BackgroundService from "react-native-background-actions";
import { getServerUrl, getApiKey, getRelayMode, isLoggedIn } from "./api";

// ── Channel setup ────────────────────────────────────────────────────────────
const CHANNEL_ID = "octo-vec-alerts";

export async function setupNotifications() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "OCTO VEC Alerts",
    description: "Task updates, agent messages, and system events",
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default",
  });

  // Request notification permission (Android 13+)
  await notifee.requestPermission();
}

// ── Send a local notification ────────────────────────────────────────────────
async function notify(title: string, body: string, id?: string) {
  await notifee.displayNotification({
    id: id || undefined,
    title,
    body,
    android: {
      channelId: CHANNEL_ID,
      smallIcon: "ic_launcher",
      pressAction: { id: "default" },
      groupId: "octo-vec",
    },
  });
}

// ── State tracking (avoid duplicate notifications) ───────────────────────────
let _lastEventTs = "";
let _lastMsgCount = 0;
let _knownTaskStatuses: Record<string, string> = {};

// ── Background poll function ─────────────────────────────────────────────────
async function poll() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) return;

  const base = await getServerUrl();
  const relayMode = await getRelayMode();

  async function apiFetch(path: string) {
    let url: string;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (relayMode) {
      const EncryptedStorage = (await import("react-native-encrypted-storage")).default;
      const secret = (await EncryptedStorage.getItem("relay_secret")) || "";
      const session = (await EncryptedStorage.getItem("relay_session")) || "default";
      url = `${base}/relay${path}`;
      headers["X-Relay-Secret"] = secret;
      headers["X-Session-Id"] = session;
    } else {
      const key = await getApiKey();
      const sep = (path || "").includes("?") ? "&" : "?";
      url = `${base}${path}${sep}key=${encodeURIComponent(key)}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  try {
    // Check for new events
    const events: any[] = await apiFetch("/api/events").catch(() => []);
    if (events.length > 0 && events[0].timestamp && events[0].timestamp !== _lastEventTs) {
      const newEvents = _lastEventTs
        ? events.filter((e: any) => e.timestamp > _lastEventTs)
        : [];
      _lastEventTs = events[0].timestamp;

      for (const ev of newEvents.slice(0, 3)) {
        const agent = ev.agent_name || ev.agent_id || "System";
        const type = (ev.type || "event").replace(/_/g, " ");
        await notify(agent, type + (ev.message ? `: ${ev.message}` : ""), `event-${ev.timestamp}`);
      }
    }

    // Check for new chat messages
    const msgs: any[] = await apiFetch("/api/chat-log").catch(() => []);
    const agentMsgs = msgs.filter((m: any) => m.from !== "user");
    if (agentMsgs.length > _lastMsgCount && _lastMsgCount > 0) {
      const newMsgs = agentMsgs.slice(_lastMsgCount);
      for (const m of newMsgs.slice(-3)) {
        await notify(
          m.from_name || m.from || "Agent",
          (m.message || "").substring(0, 100),
          `msg-${m.timestamp}`,
        );
      }
    }
    _lastMsgCount = agentMsgs.length;

    // Check for task status changes
    const tasks: any[] = await apiFetch("/api/tasks").catch(() => []);
    for (const t of tasks) {
      const prev = _knownTaskStatuses[t.id];
      if (prev && prev !== t.status) {
        if (t.status === "completed") {
          await notify("Task Completed", t.title || t.id, `task-${t.id}`);
        } else if (t.status === "failed") {
          await notify("Task Failed", t.title || t.id, `task-${t.id}`);
        }
      }
      _knownTaskStatuses[t.id] = t.status;
    }
  } catch {
    // Silent fail — network may be unavailable
  }
}

// ── Background service control ───────────────────────────────────────────────
const BG_OPTIONS = {
  taskName: "OCTO VEC Sync",
  taskTitle: "OCTO VEC",
  taskDesc: "Monitoring workspace activity",
  taskIcon: { name: "ic_launcher", type: "mipmap" as const },
  color: "#000000",
  linkingURI: "octovec://",
  parameters: { delay: 15000 },
};

async function backgroundTask(taskData: any) {
  const delay = taskData?.delay || 15000;
  await seedState();
  while (BackgroundService.isRunning()) {
    await poll();
    await new Promise((r) => setTimeout(r, delay));
  }
}

async function seedState() {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) return;

  const base = await getServerUrl();
  const relayMode = await getRelayMode();

  async function apiFetch(path: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let url: string;
    if (relayMode) {
      const EncryptedStorage = (await import("react-native-encrypted-storage")).default;
      const secret = (await EncryptedStorage.getItem("relay_secret")) || "";
      const session = (await EncryptedStorage.getItem("relay_session")) || "default";
      url = `${base}/relay${path}`;
      headers["X-Relay-Secret"] = secret;
      headers["X-Session-Id"] = session;
    } else {
      const key = await getApiKey();
      const sep = (path || "").includes("?") ? "&" : "?";
      url = `${base}${path}${sep}key=${encodeURIComponent(key)}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  try {
    const events: any[] = await apiFetch("/api/events").catch(() => []);
    if (events.length > 0) _lastEventTs = events[0].timestamp;

    const msgs: any[] = await apiFetch("/api/chat-log").catch(() => []);
    _lastMsgCount = msgs.filter((m: any) => m.from !== "user").length;

    const tasks: any[] = await apiFetch("/api/tasks").catch(() => []);
    for (const t of tasks) _knownTaskStatuses[t.id] = t.status;
  } catch {}
}

export async function startBackgroundSync() {
  if (BackgroundService.isRunning()) return;
  try {
    await BackgroundService.start(backgroundTask, BG_OPTIONS);
  } catch {}
}

export async function stopBackgroundSync() {
  try {
    await BackgroundService.stop();
  } catch {}
}

export function isBackgroundRunning(): boolean {
  return BackgroundService.isRunning();
}

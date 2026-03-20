import notifee, { AndroidImportance } from "@notifee/react-native";
import BackgroundService from "react-native-background-actions";
import { poll, seedState } from "./notificationWorker";

// ── Channel setup ────────────────────────────────────────────────────────────
export async function setupNotifications() {
  await notifee.createChannel({
    id: "octo-vec-alerts",
    name: "OCTO VEC Alerts",
    description: "Task updates, agent messages, and system events",
    importance: AndroidImportance.HIGH,
    vibration: true,
    sound: "default",
  });
  await notifee.requestPermission();
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

export async function startBackgroundSync() {
  if (BackgroundService.isRunning()) return;
  try {
    await BackgroundService.start(backgroundTask, BG_OPTIONS);
  } catch {}
}

export async function stopBackgroundSync() {
  try { await BackgroundService.stop(); } catch {}
}

export function isBackgroundRunning(): boolean {
  return BackgroundService.isRunning();
}

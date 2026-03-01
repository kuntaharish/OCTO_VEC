import { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import Sidebar, { type View } from "./components/Sidebar";
import KanbanView from "./views/KanbanView";
import OverviewView from "./views/OverviewView";
import EventsView from "./views/EventsView";
import QueueView from "./views/QueueView";
import DirectoryView from "./views/DirectoryView";
import ChatView from "./views/ChatView";
import ActivityView from "./views/ActivityView";
import LiveView from "./views/LiveView";

export default function App() {
  const [activeView, setActiveViewRaw] = useState<View>(() => {
    const saved = localStorage.getItem("active-view");
    return saved && ["overview","activity","kanban","events","queue","directory","chat","live"].includes(saved)
      ? (saved as View)
      : "kanban";
  });

  function setActiveView(v: View) {
    localStorage.setItem("active-view", v);
    setActiveViewRaw(v);
  }

  return (
    <ThemeProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-primary)" }}>
        <Sidebar activeView={activeView} setActiveView={setActiveView} />
        <main style={{
          flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
          background: "var(--bg-card)",
          borderRadius: 14,
          margin: 8,
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--border)",
        }}>
          {activeView === "overview" && <OverviewView />}
          {activeView === "activity" && <ActivityView />}
          {activeView === "kanban" && <KanbanView />}
          {activeView === "events" && <EventsView />}
          {activeView === "queue" && <QueueView />}
          {activeView === "directory" && <DirectoryView />}
          {activeView === "chat" && <ChatView />}
          {activeView === "live" && <LiveView />}
        </main>
      </div>
    </ThemeProvider>
  );
}

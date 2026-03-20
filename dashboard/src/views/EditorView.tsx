import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Configure Monaco workers for Vite (avoids CDN + fixes web worker errors)
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

// Use local monaco-editor bundle instead of CDN (CSP blocks CDN scripts)
loader.config({ monaco });
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  FileCode, FileJson, FileText, Image, Package, Terminal,
  Save, X, ArrowUp, Search, RefreshCw, PanelRightClose, PanelRightOpen,
  Circle, GitBranch, RotateCcw, FilePlus, FileEdit, Trash2, FileQuestion, Plus, ChevronDown as ChevronDownIcon,
  GitCommit, Tag, Globe, Clock, User, Copy, Check,
} from "lucide-react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePolling, postApi, authFetch, apiUrl } from "../hooks/useApi";
import { useAgentStream, type ActivityEntry } from "../hooks/useSSE";
import { useEmployees } from "../context/EmployeesContext";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface TreeEntry {
  name: string;
  path: string;
  type: "folder" | "file";
  size?: number;
  children?: TreeEntry[];
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  original: string;    // track unsaved changes
  language: string;
}

interface ChatEntry {
  from: string;
  to: string;
  message: string;
  ts: string;
  channel?: string;
}

interface GitLogEntry {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  refs: string[];
}

interface GitBranchEntry {
  name: string;
  hash: string;
  isCurrent?: boolean;
  upstream?: string | null;
  date: string;
  type: "local" | "remote" | "tag";
}

interface GitBranchesData {
  locals: GitBranchEntry[];
  remotes: GitBranchEntry[];
  tags: GitBranchEntry[];
  current: string;
}

type GitSubTab = "changes" | "commits" | "branches";

// ── Helpers ──────────────────────────────────────────────────────────────────

function extToLang(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", rb: "ruby", php: "php",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml",
    md: "markdown", txt: "plaintext", css: "css", scss: "scss", html: "html",
    sql: "sql", sh: "shell", bat: "bat", ps1: "powershell", c: "c", cpp: "cpp",
    h: "c", hpp: "cpp", swift: "swift", kt: "kotlin", r: "r",
    dockerfile: "dockerfile", makefile: "makefile",
  };
  return map[ext] ?? "plaintext";
}

function getFileIcon(name: string, size = 14): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts","tsx","js","jsx","py","rs","go","java","cpp","c","rb","php","swift","kt"].includes(ext))
    return <FileCode size={size} />;
  if (["json","yaml","yml","toml","xml"].includes(ext)) return <FileJson size={size} />;
  if (["md","txt","rst","log","csv"].includes(ext)) return <FileText size={size} />;
  if (["png","jpg","jpeg","gif","svg","webp","ico"].includes(ext)) return <Image size={size} />;
  if (ext === "dockerfile" || name === "Dockerfile") return <Package size={size} />;
  if (["sh","bat","ps1"].includes(ext) || name === "Makefile") return <Terminal size={size} />;
  return <File size={size} />;
}

function timeLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── EditorView Component ─────────────────────────────────────────────────────

export default function EditorView({ projectPath, projectName, onBack }: {
  projectPath: string;
  projectName: string;
  onBack: () => void;
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [sidebarWidth] = useState(240);
  const [chatWidth, setChatWidth] = useState(400);

  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(250);
  const [termTabs, setTermTabs] = useState<{ id: string; shell: string; label: string }[]>([]);
  const [activeTermId, setActiveTermId] = useState("");
  const [shellDropdownOpen, setShellDropdownOpen] = useState(false);
  const [availableShells, setAvailableShells] = useState<{ id: string; name: string }[]>([]);
  // Map of terminal id → { container ref, xterm, ws, fitAddon }
  const termInstances = useRef<Map<string, { term: XTerm; ws: WebSocket; fitAddon: FitAddon }>>(new Map());

  const [sidebarTab, setSidebarTab] = useState<"files" | "git">("files");
  const [gitStatus, setGitStatus] = useState<{
    isGitRepo: boolean; branch?: string;
    files?: { status: string; path: string }[];
    staged?: { status: string; path: string }[];
    unstaged?: { status: string; path: string }[];
    untracked?: { path: string }[];
  } | null>(null);
  const [gitSubTab, setGitSubTab] = useState<GitSubTab>("changes");
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([]);
  const [gitBranches, setGitBranches] = useState<GitBranchesData | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitLogEntry | null>(null);
  const [commitDetail, setCommitDetail] = useState<{ hash: string; authorName: string; authorEmail: string; date: string; subject: string; body: string; filesChanged: string } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);

  // @ mention
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIdx, setMentionIdx] = useState(0);
  const [chatTarget, setChatTarget] = useState<string | null>(null);
  const mentionRef = useRef<HTMLDivElement>(null);

  const { employees } = useEmployees();
  const empMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string; agentKey: string }>();
    (employees ?? []).forEach(e => m.set(e.agent_key, { name: e.name, color: e.color ?? "var(--accent)", agentKey: e.agent_key }));
    return m;
  }, [employees]);

  // Live agent stream (same as Live Monitor)
  const { activity, activeAgents } = useAgentStream();
  const timelineRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load file tree ─────────────────────────────────────────────────────────
  const loadTree = useCallback(async () => {
    try {
      const r = await authFetch(`/api/workspace-tree?root=${encodeURIComponent(projectPath)}`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.tree?.root?.entries) {
        setTree(data.tree.root.entries);
      }
    } catch { /* ignore */ }
  }, [projectPath]);

  useEffect(() => { loadTree(); }, [loadTree]);

  // ── Load git status ───────────────────────────────────────────────────────
  const loadGitStatus = useCallback(async () => {
    try {
      const r = await authFetch(`/api/workspace-git-status?root=${encodeURIComponent(projectPath)}`);
      if (r.ok) setGitStatus(await r.json());
    } catch { /* ignore */ }
  }, [projectPath]);

  useEffect(() => { loadGitStatus(); const t = setInterval(loadGitStatus, 10000); return () => clearInterval(t); }, [loadGitStatus]);

  // ── Load git log ──────────────────────────────────────────────────────────
  const loadGitLog = useCallback(async () => {
    try {
      const r = await authFetch(`/api/workspace-git-log?root=${encodeURIComponent(projectPath)}&limit=80`);
      if (r.ok) setGitLog(await r.json());
    } catch { /* ignore */ }
  }, [projectPath]);

  // ── Load git branches ─────────────────────────────────────────────────────
  const loadGitBranches = useCallback(async () => {
    try {
      const r = await authFetch(`/api/workspace-git-branches?root=${encodeURIComponent(projectPath)}`);
      if (r.ok) setGitBranches(await r.json());
    } catch { /* ignore */ }
  }, [projectPath]);

  // ── Load commit detail ────────────────────────────────────────────────────
  const loadCommitDetail = useCallback(async (hash: string) => {
    try {
      const r = await authFetch(`/api/workspace-git-show?root=${encodeURIComponent(projectPath)}&hash=${encodeURIComponent(hash)}`);
      if (r.ok) setCommitDetail(await r.json());
    } catch { /* ignore */ }
  }, [projectPath]);

  // Load git log + branches when switching to git tab (always load log for last commit info)
  useEffect(() => {
    if (sidebarTab !== "git") return;
    loadGitLog(); // Always load — needed for last commit display in Changes tab too
    if (gitSubTab === "branches") loadGitBranches();
  }, [sidebarTab, gitSubTab, loadGitLog, loadGitBranches]);

  // Auto-switch to Commits tab on initial load when there are no working tree changes
  const gitAutoSwitched = useRef(false);
  useEffect(() => {
    if (gitAutoSwitched.current) return; // Only auto-switch once
    if (sidebarTab === "git" && gitStatus?.isGitRepo && gitSubTab === "changes" && gitLog.length > 0 &&
      (gitStatus.staged?.length ?? 0) + (gitStatus.unstaged?.length ?? 0) + (gitStatus.untracked?.length ?? 0) === 0) {
      setGitSubTab("commits");
      gitAutoSwitched.current = true;
    }
  }, [sidebarTab, gitStatus, gitSubTab, gitLog.length]);

  // Load commit detail when selecting a commit
  useEffect(() => {
    if (selectedCommit) loadCommitDetail(selectedCommit.hash);
    else setCommitDetail(null);
  }, [selectedCommit, loadCommitDetail]);

  // Copy hash helper
  const copyHash = useCallback((hash: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 1500);
    }).catch(() => {});
  }, []);

  // ── Git actions: stage, unstage, commit ─────────────────────────────────
  const gitStage = useCallback(async (files: string[]) => {
    try {
      await postApi("/api/workspace-git-stage", { root: projectPath, files });
      loadGitStatus();
    } catch { /* ignore */ }
  }, [projectPath, loadGitStatus]);

  const gitUnstage = useCallback(async (files: string[]) => {
    try {
      await postApi("/api/workspace-git-unstage", { root: projectPath, files });
      loadGitStatus();
    } catch { /* ignore */ }
  }, [projectPath, loadGitStatus]);

  const gitCommit = useCallback(async () => {
    if (!commitMsg.trim() || committing) return;
    setCommitting(true);
    try {
      await postApi("/api/workspace-git-commit", { root: projectPath, message: commitMsg.trim() });
      setCommitMsg("");
      loadGitStatus();
      loadGitLog();
    } catch { /* ignore */ }
    setCommitting(false);
  }, [commitMsg, committing, projectPath, loadGitStatus, loadGitLog]);

  // Auto-refresh file tree + git when agent writes/edits/creates files
  const lastActivityLen = useRef(0);
  useEffect(() => {
    if (activity.length > lastActivityLen.current) {
      const newEntries = activity.slice(lastActivityLen.current);
      const hasFileChange = newEntries.some(e =>
        e.type === "tool_end" && ["edit", "write", "create", "file_edit", "file_write"].some(
          t => (e.toolName?.toLowerCase() ?? "").includes(t)
        ) && !e.isError
      );
      // Detect git operations (git init, git add, git commit, etc.) via Bash tool
      const hasGitChange = newEntries.some(e =>
        e.type === "tool_end" && (e.toolName?.toLowerCase() ?? "").includes("bash") && !e.isError
      );
      if (hasFileChange || hasGitChange) {
        loadTree();
        loadGitStatus();
        if (gitSubTab === "commits") loadGitLog();
        if (gitSubTab === "branches") loadGitBranches();
      }
    }
    lastActivityLen.current = activity.length;
  }, [activity.length, loadTree, loadGitStatus, loadGitLog, loadGitBranches, gitSubTab]);

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [activity.length]);

  // ── File operations ────────────────────────────────────────────────────────
  const openFile = useCallback(async (entry: TreeEntry) => {
    // Already open?
    const existing = tabs.find(t => t.path === entry.path);
    if (existing) { setActiveTab(entry.path); return; }

    try {
      const r = await authFetch(`/api/workspace-file?path=${encodeURIComponent(entry.path)}`);
      const data = await r.json();
      if (data.kind === "text" && data.content != null) {
        const newTab: OpenTab = {
          path: entry.path,
          name: entry.name,
          content: data.content,
          original: data.content,
          language: extToLang(entry.name),
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTab(entry.path);
      }
    } catch { /* ignore */ }
  }, [tabs]);

  const closeTab = useCallback((path: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.path !== path);
      if (activeTab === path && next.length > 0) {
        setActiveTab(next[next.length - 1].path);
      } else if (next.length === 0) {
        setActiveTab("");
      }
      return next;
    });
  }, [activeTab]);

  const updateTabContent = useCallback((path: string, content: string) => {
    setTabs(prev => prev.map(t => t.path === path ? { ...t, content } : t));
  }, []);

  const saveFile = useCallback(async (path: string) => {
    const tab = tabs.find(t => t.path === path);
    if (!tab) return;
    setSaving(true);
    try {
      const r = await postApi("/api/workspace-save", { path, content: tab.content });
      if (r.ok) {
        setTabs(prev => prev.map(t => t.path === path ? { ...t, original: t.content } : t));
      }
    } catch { /* ignore */ }
    setSaving(false);
  }, [tabs]);

  // Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (activeTab) saveFile(activeTab);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, saveFile]);

  // ── Fetch available shells ──────────────────────────────────────────────
  useEffect(() => {
    authFetch("/api/terminal-shells").then(r => r.ok ? r.json() : []).then(setAvailableShells).catch(() => {});
  }, []);

  // Close shell dropdown on outside click
  useEffect(() => {
    if (!shellDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const btn = document.getElementById("shell-dropdown-btn");
      const menu = document.getElementById("shell-dropdown-menu");
      const target = e.target as Node;
      if (btn?.contains(target) || menu?.contains(target)) return;
      setShellDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shellDropdownOpen]);

  // ── Create a new terminal tab (state only — init happens in useEffect) ───
  const createTerminal = useCallback((shellId: string, shellLabel: string) => {
    const id = `term-${Date.now()}`;
    setTermTabs(prev => [...prev, { id, shell: shellId, label: shellLabel }]);
    setActiveTermId(id);
    setTerminalOpen(true);
    setShellDropdownOpen(false);
  }, []);

  // ── Initialize xterm for any tab that doesn't have an instance yet ────────
  useEffect(() => {
    if (!terminalOpen) return;
    for (const tab of termTabs) {
      if (termInstances.current.has(tab.id)) continue;
      const container = document.getElementById(tab.id);
      if (!container) continue;

      const cs = getComputedStyle(document.documentElement);
      const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
      const bg = v("--bg-primary", "#1a1a1a");
      const fg = v("--text-primary", "#e0e0e0");
      const muted = v("--text-muted", "#666");
      const accent = v("--accent", "#5b8def");
      const term = new XTerm({
        cursorBlink: true, fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        theme: {
          background: bg, foreground: fg, cursor: accent,
          selectionBackground: accent + "66",
          selectionForeground: "#ffffff",
          black: muted,
          red: v("--red", "#e8645a"),
          green: v("--green", "#4ac083"),
          yellow: v("--yellow", "#d4a832"),
          blue: v("--blue", "#5b8def"),
          magenta: v("--purple", "#9b7ae8"),
          cyan: v("--accent", "#5b8def"),
          white: fg,
          brightBlack: muted,
          brightRed: v("--red", "#e8645a"),
          brightGreen: v("--green", "#4ac083"),
          brightYellow: v("--yellow", "#d4a832"),
          brightBlue: v("--blue", "#5b8def"),
          brightMagenta: v("--purple", "#9b7ae8"),
          brightCyan: v("--accent", "#5b8def"),
          brightWhite: fg,
        },
        allowProposedApi: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);
      fitAddon.fit();

      // Auto-copy selection to clipboard
      term.onSelectionChange(() => {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      });

      const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const key = sessionStorage.getItem("vec-api-key") ?? new URLSearchParams(window.location.search).get("key") ?? "";
      const wsUrl = `${wsProto}//${window.location.host}/ws/terminal?cwd=${encodeURIComponent(projectPath)}&shell=${tab.shell}&key=${encodeURIComponent(key)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => { ws.send("\x01" + JSON.stringify({ cols: term.cols, rows: term.rows })); };
      ws.onmessage = (ev) => { term.write(typeof ev.data === "string" ? ev.data : ""); };
      ws.onclose = () => { term.write("\r\n\x1b[90m[Disconnected]\x1b[0m\r\n"); };
      term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });
      term.onResize(({ cols, rows }) => { if (ws.readyState === WebSocket.OPEN) ws.send("\x01" + JSON.stringify({ cols, rows })); });

      termInstances.current.set(tab.id, { term, ws, fitAddon });
    }
  }, [termTabs, terminalOpen, projectPath]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
      const bg = v("--bg-primary", "#1a1a1a");
      const fg = v("--text-primary", "#e0e0e0");
      const muted = v("--text-muted", "#666");
      const accent = v("--accent", "#5b8def");
      const theme = {
        background: bg, foreground: fg, cursor: accent,
        selectionBackground: accent + "66", selectionForeground: "#ffffff",
        black: muted, red: v("--red", "#e8645a"), green: v("--green", "#4ac083"),
        yellow: v("--yellow", "#d4a832"), blue: v("--blue", "#5b8def"),
        magenta: v("--purple", "#9b7ae8"), cyan: v("--accent", "#5b8def"), white: fg,
        brightBlack: muted, brightRed: v("--red", "#e8645a"), brightGreen: v("--green", "#4ac083"),
        brightYellow: v("--yellow", "#d4a832"), brightBlue: v("--blue", "#5b8def"),
        brightMagenta: v("--purple", "#9b7ae8"), brightCyan: v("--accent", "#5b8def"), brightWhite: fg,
      };
      termInstances.current.forEach(inst => { inst.term.options.theme = theme; });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Close a terminal tab
  const closeTermTab = useCallback((id: string) => {
    const inst = termInstances.current.get(id);
    if (inst) { inst.ws.close(); inst.term.dispose(); termInstances.current.delete(id); }
    setTermTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTermId === id && next.length > 0) setActiveTermId(next[next.length - 1].id);
      if (next.length === 0) { setTerminalOpen(false); setActiveTermId(""); }
      return next;
    });
  }, [activeTermId]);

  // Switch active terminal — show/hide containers
  useEffect(() => {
    termInstances.current.forEach((inst, id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === activeTermId ? "block" : "none";
      if (id === activeTermId) setTimeout(() => inst.fitAddon.fit(), 30);
    });
  }, [activeTermId]);

  // Re-fit active terminal on height change
  useEffect(() => {
    if (terminalOpen && activeTermId) {
      const inst = termInstances.current.get(activeTermId);
      if (inst) setTimeout(() => inst.fitAddon.fit(), 50);
    }
  }, [terminalHeight, terminalOpen, activeTermId]);

  // Auto-create first terminal when opened with no tabs
  useEffect(() => {
    if (terminalOpen && termTabs.length === 0 && availableShells.length > 0) {
      createTerminal(availableShells[0].id, availableShells[0].name);
    }
  }, [terminalOpen, termTabs.length, availableShells, createTerminal]);

  // Terminal panel resize (drag from top edge)
  const startTermResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = terminalHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setTerminalHeight(Math.max(120, Math.min(500, startH + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [terminalHeight]);

  // ── Chat panel resize ───────────────────────────────────────────────────────
  const startChatResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = chatWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setChatWidth(Math.max(280, Math.min(600, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [chatWidth]);

  // ── Editor chat messages (polling) ──────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<{ id: string; timestamp: string; from: string; to: string; message: string; channel: string }[]>([]);
  const chatPollRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const since = chatPollRef.current;
        const url = `/api/editor-chat?project=${encodeURIComponent(projectPath)}${since ? `&since=${encodeURIComponent(since)}` : ""}`;
        const r = await authFetch(url);
        if (r.ok && !cancelled) {
          const msgs = await r.json();
          if (Array.isArray(msgs) && msgs.length > 0) {
            setChatMessages(prev => {
              const ids = new Set(prev.map(m => m.id));
              const newMsgs = msgs.filter((m: any) => !ids.has(m.id));
              return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
            });
            chatPollRef.current = msgs[msgs.length - 1].timestamp;
          }
        }
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [projectPath]);

  // Auto-scroll when new chat messages arrive
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [chatMessages.length]);

  // Auto-select last chatted agent as target when chat loads
  useEffect(() => {
    if (chatTarget) return; // already selected
    if (chatMessages.length === 0) return;
    // Find last agent (non-user) in chat
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m = chatMessages[i];
      if (m.from !== "user" && empMap.has(m.from)) {
        setChatTarget(m.from);
        return;
      }
      if (m.to !== "user" && empMap.has(m.to)) {
        setChatTarget(m.to);
        return;
      }
    }
  }, [chatMessages, empMap, chatTarget]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || chatSending) return;
    const target = chatTarget ?? "aria";
    setChatSending(true);
    try {
      await postApi("/api/editor-send", { to: target, message: chatInput.trim(), project: projectPath });
      setChatInput("");
      // Reset textarea height
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = "auto";
    } catch { /* ignore */ }
    setChatSending(false);
  }, [chatInput, chatSending, chatTarget, projectPath]);

  // ── @ mention helpers ───────────────────────────────────────────────────
  const mentionList = useMemo(() => {
    const list = (employees ?? []).map(e => ({ id: e.agent_key, name: e.name, color: e.color ?? "var(--accent)" }));
    if (!mentionFilter) return list;
    const f = mentionFilter.toLowerCase();
    return list.filter(e => e.name.toLowerCase().includes(f) || e.id.toLowerCase().includes(f));
  }, [employees, mentionFilter]);

  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setChatInput(val);
    // Auto-grow
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
    // Detect @ mention
    const cursor = el.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionOpen(true);
      setMentionFilter(atMatch[1]);
      setMentionIdx(0);
    } else {
      setMentionOpen(false);
      setMentionFilter("");
    }
  }, []);

  const selectMention = useCallback((agent: { id: string; name: string }) => {
    const el = chatTextareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? chatInput.length;
    const before = chatInput.slice(0, cursor);
    const after = chatInput.slice(cursor);
    // Remove the @text completely — agent is shown as a badge above the input
    const cleaned = before.replace(/@([^\s@]*)$/, "").trimEnd();
    const remaining = cleaned + (cleaned && after ? " " : "") + after;
    setChatInput(remaining.trimStart());
    setChatTarget(agent.id);
    setMentionOpen(false);
    setMentionFilter("");
    setTimeout(() => el.focus(), 0);
  }, [chatInput]);

  // ── Current tab ────────────────────────────────────────────────────────────
  const currentTab = tabs.find(t => t.path === activeTab);
  const isDirty = currentTab ? currentTab.content !== currentTab.original : false;

  // ── Flatten tree for search ────────────────────────────────────────────────
  const flatFiles = useMemo(() => {
    const result: TreeEntry[] = [];
    function walk(entries: TreeEntry[]) {
      for (const e of entries) {
        if (e.type === "file") result.push(e);
        if (e.children) walk(e.children);
      }
    }
    walk(tree);
    return result;
  }, [tree]);

  const filteredFiles = fileSearch
    ? flatFiles.filter(f => f.name.toLowerCase().includes(fileSearch.toLowerCase()))
    : [];

  // ── Toggle folder ──────────────────────────────────────────────────────────
  const toggleFolder = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: 42, flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        padding: "0 16px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "var(--accent)", cursor: "pointer",
          fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
        }}>
          <RotateCcw size={13} /> Back
        </button>
        <div style={{ width: 1, height: 18, background: "var(--border)" }} />
        <Folder size={15} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{projectName}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{projectPath}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setTerminalOpen(!terminalOpen)} style={{
          background: terminalOpen ? "var(--bg-hover)" : "none",
          border: "none", color: terminalOpen ? "var(--text-primary)" : "var(--text-muted)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          fontSize: 11, fontFamily: "inherit", borderRadius: 4, padding: "3px 8px",
        }}>
          <Terminal size={14} />
          Terminal
        </button>
        <div style={{ width: 1, height: 16, background: "var(--border)" }} />
        <button onClick={() => setChatOpen(!chatOpen)} style={{
          background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "inherit",
        }}>
          {chatOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          {chatOpen ? "Hide Chat" : "Show Chat"}
        </button>
      </div>

      {/* ── Main Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left: File Tree / Git ────────────────────────────────────── */}
        <div style={{
          width: sidebarWidth, flexShrink: 0, display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--border)", background: "var(--bg-secondary)",
        }}>
          {/* Sidebar tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            {([["files", "Files", <File size={12} key="f" />], ["git", "Source Control", <GitBranch size={12} key="g" />]] as const).map(([key, label, icon]) => (
              <button key={key} onClick={() => setSidebarTab(key as "files" | "git")}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 0", background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: sidebarTab === key ? 600 : 400, fontFamily: "inherit",
                  color: sidebarTab === key ? "var(--text-primary)" : "var(--text-muted)",
                  borderBottom: sidebarTab === key ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                {icon}{label}
                {key === "git" && gitStatus?.files && gitStatus.files.length > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 8,
                    background: "var(--accent)", color: "#fff", lineHeight: "16px",
                  }}>{gitStatus.files.length}</span>
                )}
              </button>
            ))}
          </div>

          {sidebarTab === "files" ? (
            <>
              {/* Search */}
              <div style={{ padding: "8px 8px 4px", position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 16, top: 16, color: "var(--text-muted)" }} />
                <input
                  placeholder="Search files…"
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  style={{
                    width: "100%", padding: "5px 8px 5px 28px", fontSize: 11,
                    background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                    borderRadius: 5, color: "var(--text-primary)", outline: "none",
                  }}
                />
              </div>

              {/* Search results */}
              {fileSearch && (
                <div style={{ maxHeight: 200, overflowY: "auto", borderBottom: "1px solid var(--border)" }}>
                  {filteredFiles.length === 0 && (
                    <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>No matches</div>
                  )}
                  {filteredFiles.slice(0, 20).map(f => (
                    <button key={f.path} onClick={() => { openFile(f); setFileSearch(""); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 12px", background: "none", border: "none",
                        color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
                        textAlign: "left", fontFamily: "inherit",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}
                    >
                      {getFileIcon(f.name, 12)}
                      <span style={{ color: "var(--text-primary)" }}>{f.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto", fontFamily: "monospace" }}>
                        {f.path.split("/").slice(0, -1).join("/")}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Tree */}
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                <FileTreeNode entries={tree} expanded={expanded} toggleFolder={toggleFolder}
                  openFile={openFile} activeFile={activeTab} depth={0} />
              </div>

              {/* Footer */}
              <div style={{
                padding: "6px 10px", borderTop: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <button onClick={loadTree} style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center",
                }}>
                  <RefreshCw size={12} />
                </button>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {flatFiles.length} files
                </span>
              </div>
            </>
          ) : (
            /* ── Git Source Control Panel ─────────────────────────────────── */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {!gitStatus || !gitStatus.isGitRepo ? (
                <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                  Not a git repository
                </div>
              ) : (
                <>
                  {/* Branch header */}
                  <div style={{
                    padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <GitBranch size={13} style={{ color: "var(--accent)" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{gitStatus.branch}</span>
                    <button onClick={() => { loadGitStatus(); if (gitSubTab === "commits") loadGitLog(); if (gitSubTab === "branches") loadGitBranches(); }} style={{
                      marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-muted)", display: "flex", alignItems: "center",
                    }}>
                      <RefreshCw size={11} />
                    </button>
                  </div>

                  {/* Sub-tabs: Changes | Commits | Branches */}
                  <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                    {([["changes", "Changes"], ["commits", "Commits"], ["branches", "Branches"]] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setGitSubTab(key)}
                        style={{
                          flex: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer",
                          fontSize: 10, fontWeight: gitSubTab === key ? 600 : 400, fontFamily: "inherit",
                          color: gitSubTab === key ? "var(--text-primary)" : "var(--text-muted)",
                          borderBottom: gitSubTab === key ? "2px solid var(--accent)" : "2px solid transparent",
                        }}
                      >
                        {label}
                        {key === "changes" && ((gitStatus.staged?.length ?? 0) + (gitStatus.unstaged?.length ?? 0) + (gitStatus.untracked?.length ?? 0)) > 0 && (
                          <span style={{
                            fontSize: 8, fontWeight: 700, padding: "0 4px", borderRadius: 8,
                            background: "var(--accent)", color: "#fff", lineHeight: "14px", marginLeft: 4,
                          }}>{(gitStatus.staged?.length ?? 0) + (gitStatus.unstaged?.length ?? 0) + (gitStatus.untracked?.length ?? 0)}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* ── Changes sub-tab ─────────────────────────────────────── */}
                  {gitSubTab === "changes" && (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      {/* ── Commit message input ─────────────────────────── */}
                      {(gitStatus.staged?.length ?? 0) + (gitStatus.unstaged?.length ?? 0) + (gitStatus.untracked?.length ?? 0) > 0 && (
                        <div style={{ padding: "8px 8px 4px", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <input
                              value={commitMsg}
                              onChange={e => setCommitMsg(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); gitCommit(); } }}
                              placeholder="Commit message"
                              style={{
                                flex: 1, padding: "5px 8px", fontSize: 11,
                                background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                                borderRadius: 4, color: "var(--text-primary)", outline: "none",
                                fontFamily: "inherit",
                              }}
                            />
                            <button
                              onClick={gitCommit}
                              disabled={!commitMsg.trim() || (gitStatus.staged?.length ?? 0) === 0 || committing}
                              style={{
                                padding: "4px 10px", fontSize: 10, fontWeight: 600, fontFamily: "inherit",
                                background: commitMsg.trim() && (gitStatus.staged?.length ?? 0) > 0 ? "var(--accent)" : "var(--bg-hover)",
                                color: commitMsg.trim() && (gitStatus.staged?.length ?? 0) > 0 ? "#fff" : "var(--text-muted)",
                                border: "none", borderRadius: 4, cursor: commitMsg.trim() && (gitStatus.staged?.length ?? 0) > 0 ? "pointer" : "default",
                                opacity: committing ? 0.6 : 1,
                              }}
                            >
                              {committing ? "..." : "Commit"}
                            </button>
                          </div>
                          {commitMsg.trim() && (gitStatus.staged?.length ?? 0) === 0 && (
                            <div style={{ fontSize: 9, color: "var(--yellow, #e2b93d)", marginTop: 3, padding: "0 2px" }}>
                              Stage files before committing
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Scrollable file sections ─────────────────────── */}
                      <div style={{ flex: 1, overflowY: "auto" }}>
                        {/* Empty state */}
                        {(gitStatus.staged?.length ?? 0) + (gitStatus.unstaged?.length ?? 0) + (gitStatus.untracked?.length ?? 0) === 0 && (
                          <div style={{ padding: "12px" }}>
                            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11, marginBottom: 8 }}>
                              No changes detected
                            </div>
                            {gitLog.length > 0 && (
                              <div style={{
                                padding: "8px 10px", borderRadius: 6, background: "var(--bg-primary)",
                                border: "1px solid var(--border)",
                              }}>
                                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  Last Commit
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                  <GitCommit size={10} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {gitLog[0].subject}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: "var(--text-muted)" }}>
                                  <code style={{ color: "var(--accent)", fontSize: 9, fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>{gitLog[0].shortHash}</code>
                                  <span>·</span>
                                  <span>{gitLog[0].authorName}</span>
                                  <span>·</span>
                                  <span>{(() => {
                                    const d = new Date(gitLog[0].date);
                                    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
                                    if (diffMin < 1) return "just now";
                                    if (diffMin < 60) return `${diffMin}m ago`;
                                    const diffHr = Math.floor(diffMin / 60);
                                    if (diffHr < 24) return `${diffHr}h ago`;
                                    return `${Math.floor(diffHr / 24)}d ago`;
                                  })()}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Staged Changes ─────────────────────────────── */}
                        {(gitStatus.staged?.length ?? 0) > 0 && (
                          <div>
                            <div style={{
                              padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
                              borderBottom: "1px solid var(--border)", background: "var(--bg-tertiary)",
                            }}>
                              <ChevronDown size={11} style={{ color: "var(--green)", flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)", flex: 1 }}>
                                Staged Changes
                              </span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 8,
                                background: "rgba(74,192,131,0.12)", color: "var(--green)", lineHeight: "16px",
                              }}>{gitStatus.staged!.length}</span>
                              <button onClick={() => gitUnstage(["."])} title="Unstage All" style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 3, width: 22, height: 22, borderRadius: 4, fontFamily: "inherit",
                              }}
                                onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                              ><RotateCcw size={13} /></button>
                            </div>
                            {gitStatus.staged!.map((f, i) => {
                              const statusMap: Record<string, { label: string; color: string }> = {
                                M: { label: "M", color: "var(--yellow, #e2b93d)" },
                                A: { label: "A", color: "var(--green)" },
                                D: { label: "D", color: "var(--red)" },
                                R: { label: "R", color: "var(--accent)" },
                              };
                              const st = statusMap[f.status] ?? { label: f.status, color: "var(--text-muted)" };
                              const fileName = f.path.split("/").pop() ?? f.path;
                              const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
                              return (
                                <div key={`s-${i}`}
                                  onClick={() => openFile({ name: fileName, path: f.path, type: "file" })}
                                  style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 6,
                                    padding: "3px 8px 3px 14px", background: "transparent",
                                    cursor: "pointer", fontFamily: "inherit",
                                    fontSize: 11.5, color: "var(--text-secondary)",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                  <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{getFileIcon(fileName, 14)}</span>
                                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                                    {fileName}
                                  </span>
                                  {dir && (
                                    <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'Cascadia Code', 'Fira Code', monospace", flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {dir}
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, color: st.color, flexShrink: 0, width: 14, textAlign: "center",
                                  }}>{st.label}</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); gitUnstage([f.path]); }}
                                    title="Unstage"
                                    style={{
                                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                      cursor: "pointer", padding: 3, width: 20, height: 20,
                                      color: "var(--text-muted)", borderRadius: 4,
                                      background: "transparent", border: "none", fontFamily: "inherit",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                                  ><RotateCcw size={12} /></button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Unstaged Changes ───────────────────────────── */}
                        {(gitStatus.unstaged?.length ?? 0) > 0 && (
                          <div>
                            <div style={{
                              padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
                              borderBottom: "1px solid var(--border)", background: "var(--bg-tertiary)",
                            }}>
                              <ChevronDown size={11} style={{ color: "var(--yellow, #e2b93d)", flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--yellow, #e2b93d)", flex: 1 }}>
                                Changes
                              </span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 8,
                                background: "rgba(226,185,61,0.12)", color: "var(--yellow, #e2b93d)", lineHeight: "16px",
                              }}>{gitStatus.unstaged!.length}</span>
                              <button onClick={() => gitStage(gitStatus.unstaged!.map(f => f.path))} title="Stage All" style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 3, width: 22, height: 22, borderRadius: 4, fontFamily: "inherit",
                              }}
                                onMouseEnter={e => { e.currentTarget.style.color = "var(--green)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                              ><Plus size={14} /></button>
                            </div>
                            {gitStatus.unstaged!.map((f, i) => {
                              const statusMap: Record<string, { label: string; color: string }> = {
                                M: { label: "M", color: "var(--yellow, #e2b93d)" },
                                D: { label: "D", color: "var(--red)" },
                              };
                              const st = statusMap[f.status] ?? { label: f.status, color: "var(--text-muted)" };
                              const fileName = f.path.split("/").pop() ?? f.path;
                              const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
                              return (
                                <div key={`u-${i}`}
                                  onClick={() => openFile({ name: fileName, path: f.path, type: "file" })}
                                  style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 6,
                                    padding: "3px 8px 3px 14px", background: "transparent",
                                    cursor: "pointer", fontFamily: "inherit",
                                    fontSize: 11.5, color: "var(--text-secondary)",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                  <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{getFileIcon(fileName, 14)}</span>
                                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                                    {fileName}
                                  </span>
                                  {dir && (
                                    <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'Cascadia Code', 'Fira Code', monospace", flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {dir}
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, color: st.color, flexShrink: 0, width: 14, textAlign: "center",
                                  }}>{st.label}</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); gitStage([f.path]); }}
                                    title="Stage"
                                    style={{
                                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                      cursor: "pointer", padding: 3, width: 20, height: 20,
                                      color: "var(--text-muted)", borderRadius: 4,
                                      background: "transparent", border: "none", fontFamily: "inherit",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = "var(--green)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                                  ><Plus size={13} /></button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Untracked Files ────────────────────────────── */}
                        {(gitStatus.untracked?.length ?? 0) > 0 && (
                          <div>
                            <div style={{
                              padding: "6px 12px", display: "flex", alignItems: "center", gap: 6,
                              borderBottom: "1px solid var(--border)", background: "var(--bg-tertiary)",
                            }}>
                              <ChevronDown size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", flex: 1 }}>
                                Untracked
                              </span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 8,
                                background: "var(--bg-hover)", color: "var(--text-muted)", lineHeight: "16px",
                              }}>{gitStatus.untracked!.length}</span>
                              <button onClick={() => gitStage(gitStatus.untracked!.map(f => f.path))} title="Stage All" style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 3, width: 22, height: 22, borderRadius: 4, fontFamily: "inherit",
                              }}
                                onMouseEnter={e => { e.currentTarget.style.color = "var(--green)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                              ><Plus size={14} /></button>
                            </div>
                            {gitStatus.untracked!.map((f, i) => {
                              const fileName = f.path.split("/").pop() ?? f.path;
                              const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
                              return (
                                <div key={`t-${i}`}
                                  onClick={() => openFile({ name: fileName, path: f.path, type: "file" })}
                                  style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 6,
                                    padding: "3px 8px 3px 14px", background: "transparent",
                                    cursor: "pointer", fontFamily: "inherit",
                                    fontSize: 11.5, color: "var(--text-secondary)",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                  <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{getFileIcon(fileName, 14)}</span>
                                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                                    {fileName}
                                  </span>
                                  {dir && (
                                    <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontFamily: "'Cascadia Code', 'Fira Code', monospace", flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {dir}
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: 9, fontWeight: 700, color: "var(--green)", flexShrink: 0, width: 14, textAlign: "center",
                                  }}>U</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); gitStage([f.path]); }}
                                    title="Stage"
                                    style={{
                                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                      cursor: "pointer", padding: 3, width: 20, height: 20,
                                      color: "var(--text-muted)", borderRadius: 4,
                                      background: "transparent", border: "none", fontFamily: "inherit",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = "var(--green)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                                  ><Plus size={13} /></button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Commits sub-tab (graph + history) ──────────────────── */}
                  {gitSubTab === "commits" && (
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      {selectedCommit && commitDetail ? (
                        /* ── Commit detail view ────────────────────────── */
                        <div style={{ padding: 0 }}>
                          <button onClick={() => { setSelectedCommit(null); setCommitDetail(null); }} style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 4,
                            padding: "6px 10px", background: "var(--bg-hover)", border: "none",
                            cursor: "pointer", fontSize: 10, color: "var(--accent)", fontFamily: "inherit", fontWeight: 600,
                            borderBottom: "1px solid var(--border)",
                          }}>
                            <RotateCcw size={10} /> Back to log
                          </button>
                          <div style={{ padding: "10px 12px" }}>
                            {/* Subject */}
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.4 }}>
                              {commitDetail.subject}
                            </div>
                            {/* Meta */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                                <User size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{commitDetail.authorName}</span>
                                <span style={{ color: "var(--text-muted)" }}>&lt;{commitDetail.authorEmail}&gt;</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                                <Clock size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                <span style={{ color: "var(--text-secondary)" }}>{new Date(commitDetail.date).toLocaleString()}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                                <GitCommit size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                <code style={{ color: "var(--accent)", fontSize: 10, background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3 }}>
                                  {commitDetail.hash.slice(0, 10)}
                                </code>
                                <button onClick={() => copyHash(commitDetail.hash)} style={{
                                  background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                                  display: "flex", alignItems: "center", padding: 0,
                                }}>
                                  {copiedHash === commitDetail.hash ? <Check size={10} style={{ color: "var(--green)" }} /> : <Copy size={10} />}
                                </button>
                              </div>
                              {/* Refs (branches/tags) */}
                              {selectedCommit.refs.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                                  {selectedCommit.refs.map((ref, ri) => {
                                    const isTag = ref.startsWith("tag:");
                                    const isHead = ref.includes("HEAD");
                                    return (
                                      <span key={ri} style={{
                                        fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                                        background: isTag ? "var(--yellow, #e2b93d)18" : isHead ? "var(--accent)18" : "var(--green)18",
                                        color: isTag ? "var(--yellow, #e2b93d)" : isHead ? "var(--accent)" : "var(--green)",
                                        display: "flex", alignItems: "center", gap: 3,
                                      }}>
                                        {isTag ? <Tag size={8} /> : <GitBranch size={8} />}
                                        {ref.replace("tag: ", "")}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {/* Body */}
                            {commitDetail.body && (
                              <div style={{
                                fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.5,
                                padding: "6px 8px", background: "var(--bg-primary)", borderRadius: 5,
                                border: "1px solid var(--border)", marginBottom: 8, whiteSpace: "pre-wrap",
                              }}>
                                {commitDetail.body}
                              </div>
                            )}
                            {/* Files changed */}
                            {commitDetail.filesChanged && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>Files Changed</div>
                                <div style={{
                                  fontSize: 10, fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                                  padding: "6px 8px", background: "var(--bg-primary)", borderRadius: 5,
                                  border: "1px solid var(--border)", lineHeight: 1.6, color: "var(--text-secondary)",
                                  whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto",
                                }}>
                                  {commitDetail.filesChanged}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* ── Commit list with graph ────────────────────── */
                        <>
                          {gitLog.length === 0 ? (
                            <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                              No commits yet
                            </div>
                          ) : gitLog.map((commit, idx) => {
                            // ── Simple graph: compute lane/color for visual graph
                            const isMerge = commit.parents.length > 1;
                            const hasRefs = commit.refs.length > 0;
                            const isHead = commit.refs.some(r => r.includes("HEAD"));
                            // Color cycle for graph nodes
                            const graphColors = ["var(--accent)", "var(--green)", "#e2b93d", "var(--red)", "#a78bfa", "#f472b6"];
                            const nodeColor = graphColors[idx % graphColors.length];
                            const prevCommit = idx > 0 ? gitLog[idx - 1] : null;
                            const nextCommit = idx < gitLog.length - 1 ? gitLog[idx + 1] : null;

                            return (
                              <button key={commit.hash}
                                onClick={() => setSelectedCommit(commit)}
                                style={{
                                  width: "100%", display: "flex", gap: 0, padding: 0,
                                  background: "none", border: "none", cursor: "pointer",
                                  textAlign: "left", fontFamily: "inherit",
                                  borderBottom: "1px solid var(--border)",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "none")}
                              >
                                {/* Graph column */}
                                <div style={{
                                  width: 28, flexShrink: 0, display: "flex", flexDirection: "column",
                                  alignItems: "center", position: "relative",
                                }}>
                                  {/* Line above */}
                                  {idx > 0 && (
                                    <div style={{ width: 2, height: 10, background: nodeColor }} />
                                  )}
                                  {idx === 0 && <div style={{ height: 10 }} />}
                                  {/* Node */}
                                  <div style={{
                                    width: isMerge ? 10 : 8, height: isMerge ? 10 : 8,
                                    borderRadius: "50%", flexShrink: 0,
                                    background: isHead ? nodeColor : "transparent",
                                    border: `2px solid ${nodeColor}`,
                                    boxShadow: isHead ? `0 0 6px ${nodeColor}` : "none",
                                  }} />
                                  {/* Line below */}
                                  {idx < gitLog.length - 1 && (
                                    <div style={{ width: 2, flex: 1, minHeight: 10, background: graphColors[(idx + 1) % graphColors.length] }} />
                                  )}
                                  {/* Merge branch lines */}
                                  {isMerge && (
                                    <div style={{
                                      position: "absolute", top: 14, left: 18,
                                      width: 8, height: 8, borderTop: `2px solid ${nodeColor}`,
                                      borderRight: `2px solid ${nodeColor}`, borderRadius: "0 6px 0 0",
                                    }} />
                                  )}
                                </div>
                                {/* Content */}
                                <div style={{ flex: 1, padding: "6px 10px 6px 2px", minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                    <span style={{
                                      fontSize: 11, fontWeight: 600, color: "var(--text-primary)",
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
                                    }}>
                                      {commit.subject}
                                    </span>
                                  </div>
                                  {/* Refs (branch/tag badges) */}
                                  {hasRefs && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                                      {commit.refs.map((ref, ri) => {
                                        const isTag = ref.startsWith("tag:");
                                        const isHEAD = ref.includes("HEAD");
                                        return (
                                          <span key={ri} style={{
                                            fontSize: 8, fontWeight: 700, padding: "0 5px", borderRadius: 3,
                                            background: isTag ? "var(--yellow, #e2b93d)18" : isHEAD ? "var(--accent)18" : "var(--green)18",
                                            color: isTag ? "var(--yellow, #e2b93d)" : isHEAD ? "var(--accent)" : "var(--green)",
                                            display: "flex", alignItems: "center", gap: 2, lineHeight: "14px",
                                          }}>
                                            {isTag ? <Tag size={7} /> : <GitBranch size={7} />}
                                            {ref.replace("tag: ", "")}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {/* Author + date + hash */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                                    <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{commit.authorName}</span>
                                    <span style={{ fontSize: 9, color: "var(--text-muted)", opacity: 0.6 }}>·</span>
                                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                                      {(() => {
                                        const d = new Date(commit.date);
                                        const now = new Date();
                                        const diffMs = now.getTime() - d.getTime();
                                        const diffMin = Math.floor(diffMs / 60000);
                                        if (diffMin < 1) return "just now";
                                        if (diffMin < 60) return `${diffMin}m ago`;
                                        const diffHr = Math.floor(diffMin / 60);
                                        if (diffHr < 24) return `${diffHr}h ago`;
                                        const diffDay = Math.floor(diffHr / 24);
                                        if (diffDay < 30) return `${diffDay}d ago`;
                                        return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
                                      })()}
                                    </span>
                                    <code style={{
                                      fontSize: 9, color: "var(--accent)", marginLeft: "auto",
                                      fontFamily: "'Cascadia Code', 'Fira Code', monospace", opacity: 0.8,
                                    }}>{commit.shortHash}</code>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Branches sub-tab ────────────────────────────────── */}
                  {gitSubTab === "branches" && (
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      {!gitBranches ? (
                        <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>Loading...</div>
                      ) : (
                        <>
                          {/* Local branches */}
                          {gitBranches.locals.length > 0 && (
                            <div>
                              <div style={{
                                padding: "6px 12px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
                                textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid var(--border)",
                                background: "var(--bg-tertiary)",
                              }}>Local Branches</div>
                              {gitBranches.locals.map(b => (
                                <div key={b.name} style={{
                                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                                  borderBottom: "1px solid var(--border)",
                                  background: b.isCurrent ? "var(--accent)08" : "none",
                                }}>
                                  <GitBranch size={12} style={{ color: b.isCurrent ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }} />
                                  <span style={{
                                    fontSize: 11, fontWeight: b.isCurrent ? 700 : 400,
                                    color: b.isCurrent ? "var(--accent)" : "var(--text-primary)",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>
                                    {b.name}
                                  </span>
                                  {b.isCurrent && (
                                    <span style={{
                                      fontSize: 8, fontWeight: 700, padding: "0 5px", borderRadius: 3,
                                      background: "var(--accent)18", color: "var(--accent)", lineHeight: "14px",
                                    }}>HEAD</span>
                                  )}
                                  {b.upstream && (
                                    <span style={{ fontSize: 9, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 2 }}>
                                      <Globe size={8} /> {b.upstream}
                                    </span>
                                  )}
                                  <code style={{
                                    fontSize: 9, color: "var(--text-muted)", marginLeft: "auto",
                                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                                  }}>{b.hash}</code>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Remote branches */}
                          {gitBranches.remotes.length > 0 && (
                            <div>
                              <div style={{
                                padding: "6px 12px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
                                textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid var(--border)",
                                background: "var(--bg-tertiary)",
                              }}>Remote Branches</div>
                              {gitBranches.remotes.map(b => (
                                <div key={b.name} style={{
                                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                                  borderBottom: "1px solid var(--border)",
                                }}>
                                  <Globe size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                  <span style={{
                                    fontSize: 11, color: "var(--text-primary)",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }}>{b.name}</span>
                                  <code style={{
                                    fontSize: 9, color: "var(--text-muted)", marginLeft: "auto",
                                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                                  }}>{b.hash}</code>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Tags */}
                          {gitBranches.tags.length > 0 && (
                            <div>
                              <div style={{
                                padding: "6px 12px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
                                textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid var(--border)",
                                background: "var(--bg-tertiary)",
                              }}>Tags</div>
                              {gitBranches.tags.map(t => (
                                <div key={t.name} style={{
                                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                                  borderBottom: "1px solid var(--border)",
                                }}>
                                  <Tag size={12} style={{ color: "var(--yellow, #e2b93d)", flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: "var(--text-primary)" }}>{t.name}</span>
                                  <code style={{
                                    fontSize: 9, color: "var(--text-muted)", marginLeft: "auto",
                                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                                  }}>{t.hash}</code>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Empty state */}
                          {gitBranches.locals.length === 0 && gitBranches.remotes.length === 0 && gitBranches.tags.length === 0 && (
                            <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>
                              No branches found
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Summary footer */}
                  <div style={{
                    padding: "6px 10px", borderTop: "1px solid var(--border)",
                    fontSize: 10, color: "var(--text-muted)", display: "flex", gap: 8,
                  }}>
                    {gitSubTab === "changes" && <span>{gitStatus.staged?.length ?? 0} staged · {gitStatus.unstaged?.length ?? 0} modified · {gitStatus.untracked?.length ?? 0} untracked</span>}
                    {gitSubTab === "commits" && <span>{gitLog.length} commits</span>}
                    {gitSubTab === "branches" && <span>{(gitBranches?.locals.length ?? 0) + (gitBranches?.remotes.length ?? 0)} branches · {gitBranches?.tags.length ?? 0} tags</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Center: Editor ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Tab bar */}
          <div style={{
            height: 34, flexShrink: 0, display: "flex", alignItems: "center",
            background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)",
            overflowX: "auto",
          }}>
            {tabs.map(tab => {
              const dirty = tab.content !== tab.original;
              const active = tab.path === activeTab;
              return (
                <div key={tab.path}
                  onClick={() => setActiveTab(tab.path)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "0 12px", height: "100%", cursor: "pointer",
                    background: active ? "var(--bg-card)" : "transparent",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    borderRight: "1px solid var(--border)",
                    fontSize: 11.5, color: active ? "var(--text-primary)" : "var(--text-muted)",
                    whiteSpace: "nowrap", position: "relative",
                  }}
                >
                  {getFileIcon(tab.name, 12)}
                  <span>{tab.name}</span>
                  {dirty && <Circle size={7} fill="var(--accent)" style={{ color: "var(--accent)" }} />}
                  <button onClick={e => { e.stopPropagation(); closeTab(tab.path); }}
                    style={{
                      background: "none", border: "none", color: "var(--text-muted)",
                      cursor: "pointer", padding: 0, display: "flex", marginLeft: 2,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
            {tabs.length > 0 && isDirty && (
              <button onClick={() => saveFile(activeTab)}
                style={{
                  marginLeft: 8, display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 10px", borderRadius: 4, border: "none",
                  background: "var(--accent)", color: "#fff", fontSize: 11,
                  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Save size={11} /> {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>

          {/* Editor area */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {currentTab ? (
              <Editor
                language={currentTab.language}
                value={currentTab.content}
                onChange={v => { if (v !== undefined) updateTabContent(currentTab.path, v); }}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  minimap: { enabled: true, scale: 1 },
                  scrollBeyondLastLine: false,
                  padding: { top: 8, bottom: 8 },
                  lineNumbers: "on",
                  renderLineHighlight: "line",
                  bracketPairColorization: { enabled: true },
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  wordWrap: "on",
                  tabSize: 2,
                }}
              />
            ) : (
              <div style={{
                height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 12,
                color: "var(--text-muted)",
              }}>
                <div style={{ fontSize: 48, opacity: 0.15 }}>{ "{ }" }</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>OCTO-EDIT</div>
                <div style={{ fontSize: 11 }}>Select a file from the sidebar to start editing</div>
                <div style={{ fontSize: 10, marginTop: 8, opacity: 0.5 }}>Ctrl+S to save</div>
              </div>
            )}
          </div>

          {/* ── Terminal Panel ─────────────────────────────────────────── */}
          {terminalOpen && (
            <div style={{ height: terminalHeight, flexShrink: 0, display: "flex", flexDirection: "column", position: "relative" }}>
              {/* Resize handle */}
              <div onMouseDown={startTermResize} style={{
                position: "absolute", top: -3, left: 0, right: 0, height: 6,
                cursor: "row-resize", zIndex: 10,
              }} />
              {/* Terminal header with tabs */}
              <div style={{
                height: 32, flexShrink: 0, display: "flex", alignItems: "center",
                borderTop: "1px solid var(--border)", background: "var(--bg-secondary)",
                overflow: "hidden",
              }}>
                {/* Tabs */}
                <div style={{ display: "flex", flex: 1, overflow: "auto", minWidth: 0 }}>
                  {termTabs.map(tab => (
                    <div key={tab.id}
                      onClick={() => setActiveTermId(tab.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "0 10px", height: 32, cursor: "pointer",
                        background: tab.id === activeTermId ? "var(--bg-card)" : "transparent",
                        borderBottom: tab.id === activeTermId ? "2px solid var(--accent)" : "2px solid transparent",
                        borderRight: "1px solid var(--border)",
                        fontSize: 11, color: tab.id === activeTermId ? "var(--text-primary)" : "var(--text-muted)",
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      <Terminal size={11} />
                      <span>{tab.label}</span>
                      <button onClick={e => { e.stopPropagation(); closeTermTab(tab.id); }}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0, display: "flex", marginLeft: 2 }}
                        onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                      ><X size={11} /></button>
                    </div>
                  ))}
                </div>
                {/* + New terminal dropdown */}
                <div style={{ flexShrink: 0 }} ref={el => { if (el) (el as any).__shellBtnRef = el; }}>
                  <button id="shell-dropdown-btn" onClick={() => setShellDropdownOpen(!shellDropdownOpen)} style={{
                    background: "none", border: "none", color: "var(--text-muted)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 2,
                    padding: "4px 8px", fontSize: 11, fontFamily: "inherit",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                  >
                    <Plus size={13} />
                    <ChevronDownIcon size={10} />
                  </button>
                </div>
                {shellDropdownOpen && createPortal(
                  <div id="shell-dropdown-menu" style={{
                    position: "fixed",
                    top: (document.getElementById("shell-dropdown-btn")?.getBoundingClientRect().bottom ?? 0) + 2,
                    left: (document.getElementById("shell-dropdown-btn")?.getBoundingClientRect().right ?? 0) - 160,
                    zIndex: 9999,
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                    minWidth: 160, overflow: "hidden",
                  }}>
                    {availableShells.map(s => (
                      <button key={s.id} onClick={() => createTerminal(s.id, s.name)} style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 12px", background: "none", border: "none",
                        color: "var(--text-primary)", fontSize: 11.5, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <Terminal size={12} />
                        {s.name}
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}
                {/* Close all */}
                <button onClick={() => { termTabs.forEach(t => closeTermTab(t.id)); }} style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", padding: "4px 8px",
                }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                ><X size={13} /></button>
              </div>
              {/* Terminal containers — one per tab, only active is visible */}
              <div style={{ flex: 1, overflow: "hidden", background: "var(--bg-primary)", position: "relative" }}>
                {termTabs.map(tab => (
                  <div key={tab.id} id={tab.id} style={{
                    width: "100%", height: "100%", padding: "4px 0 0 4px",
                    display: tab.id === activeTermId ? "block" : "none",
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Status bar */}
          <div style={{
            height: 24, flexShrink: 0, display: "flex", alignItems: "center",
            padding: "0 12px", gap: 12, background: "var(--bg-tertiary)",
            borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--text-muted)",
          }}>
            {currentTab && (
              <>
                <span>{currentTab.language}</span>
                <span>•</span>
                <span>{currentTab.path}</span>
                <span>•</span>
                <span>{isDirty ? "Modified" : "Saved"}</span>
              </>
            )}
            <div style={{ flex: 1 }} />
            <span>OCTO-EDIT</span>
          </div>
        </div>

        {/* ── Right: Chat Panel (resizable) ──────────────────────────────── */}
        {chatOpen && (
          <div style={{
            width: chatWidth, minWidth: 280, maxWidth: 600, flexShrink: 0,
            display: "flex", flexDirection: "column", position: "relative",
            borderLeft: "1px solid var(--border)", background: "var(--bg-secondary)",
          }}>
            {/* Resize handle */}
            <div
              onMouseDown={startChatResize}
              style={{
                position: "absolute", left: -3, top: 0, bottom: 0, width: 6,
                cursor: "col-resize", zIndex: 10,
              }}
            />
            {/* ── Scrollable area: Chat bubbles + collapsible live activity ── */}
            <div ref={timelineRef} style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
              {chatMessages.length === 0 && activity.length === 0 ? (
                <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: 11, fontStyle: "italic" }}>
                  Type @ to mention an agent and start chatting
                </div>
              ) : (
                <ChatTimeline
                  chatMessages={chatMessages}
                  activity={activity}
                  activeAgents={activeAgents}
                  empMap={empMap}
                />
              )}
            </div>

            {/* Chat input — Cursor-style with grey bg, grows upward */}
            <div style={{ padding: "8px 12px 10px", marginTop: "auto" }}>
              <div style={{
                background: "var(--bg-primary)", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                overflow: "visible", position: "relative",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }}>
                {/* @ mention dropdown */}
                {mentionOpen && mentionList.length > 0 && (
                  <div ref={mentionRef} style={{
                    position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4,
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: 8, maxHeight: 200, overflowY: "auto", zIndex: 50,
                    boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
                  }}>
                    {mentionList.slice(0, 10).map((agent, idx) => (
                      <button key={agent.id}
                        onClick={() => selectMention(agent)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 12px", border: "none", cursor: "pointer",
                          background: idx === mentionIdx ? "var(--bg-hover)" : "transparent",
                          color: "var(--text-primary)", fontSize: 12, fontFamily: "inherit",
                          textAlign: "left",
                        }}
                        onMouseEnter={() => setMentionIdx(idx)}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: "50%", display: "flex",
                          alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700,
                          background: `${agent.color}25`, color: agent.color, flexShrink: 0,
                        }}>{getInitials(agent.name)}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 11.5 }}>{agent.name}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{agent.id}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* Target badge */}
                {chatTarget && (
                  <div style={{
                    padding: "4px 10px 0", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 10,
                      background: `${empMap.get(chatTarget)?.color ?? "var(--accent)"}18`,
                      color: empMap.get(chatTarget)?.color ?? "var(--accent)",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      @ {empMap.get(chatTarget)?.name ?? chatTarget}
                      <button onClick={() => setChatTarget(null)} style={{
                        background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex",
                      }}><X size={10} /></button>
                    </span>
                  </div>
                )}
                <textarea
                  ref={chatTextareaRef}
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyDown={e => {
                    if (mentionOpen && mentionList.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, Math.min(mentionList.length - 1, 9))); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectMention(mentionList[mentionIdx]); return; }
                      if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                  }}
                  placeholder="Message agent… type @ to mention"
                  rows={1}
                  style={{
                    width: "100%", resize: "none", padding: "10px 14px", fontSize: 12.5,
                    background: "transparent", border: "none",
                    color: "var(--text-primary)", outline: "none",
                    fontFamily: "inherit", lineHeight: 1.5,
                    minHeight: 38, maxHeight: 140, overflowY: "auto",
                    display: "block",
                  }}
                />
                {/* Separator + send row */}
                <div style={{
                  borderTop: "1px solid var(--border)",
                  padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "flex-end",
                }}>
                  <button onClick={sendChat}
                    disabled={!chatInput.trim() || chatSending}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", border: "none",
                      background: chatInput.trim() ? "var(--accent)" : "var(--bg-hover)",
                      color: chatInput.trim() ? "#fff" : "var(--text-muted)",
                      cursor: chatInput.trim() ? "pointer" : "default",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    <ArrowUp size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── File Tree Component ──────────────────────────────────────────────────────

// ── Chat Timeline — chat bubbles first, then collapsible live activity ───────

function ChatTimeline({ chatMessages, activity, activeAgents, empMap }: {
  chatMessages: { id: string; timestamp: string; from: string; to: string; message: string }[];
  activity: ActivityEntry[];
  activeAgents: Record<string, boolean>;
  empMap: Map<string, { name: string; color: string; agentKey: string }>;
}) {
  const [liveExpanded, setLiveExpanded] = useState(true);

  // Determine which agents are relevant to this editor chat
  const relevantAgents = useMemo(() => {
    const agents = new Set<string>();
    for (const m of chatMessages) {
      if (m.from !== "user") agents.add(m.from);
      if (m.to !== "user") agents.add(m.to);
    }
    return agents;
  }, [chatMessages]);

  // Only track active state for agents relevant to this chat
  const activeKeys = Object.keys(activeAgents).filter(k => activeAgents[k] && (relevantAgents.size === 0 || relevantAgents.has(k)));
  const anyActive = activeKeys.length > 0;

  // Auto-expand when agents become active
  const prevActive = useRef(false);
  useEffect(() => {
    if (anyActive && !prevActive.current) setLiveExpanded(true);
    prevActive.current = anyActive;
  }, [anyActive]);

  // Filter activity: only relevant agents, skip noise — always persist (no auto-hide)
  const filteredActivity = useMemo(() =>
    activity.slice(-80).filter(entry => {
      // Only show activity from agents involved in this editor chat
      if (relevantAgents.size > 0 && !relevantAgents.has(entry.agentId)) return false;
      const tn = entry.toolName?.toLowerCase() ?? "";
      if (entry.type === "tool_end" && !entry.isError) return false;
      if (entry.type === "tool_start" && tn.includes("message_agent")) return false;
      if (entry.type === "thinking") return false;
      return true;
    }),
  [activity, relevantAgents]);

  // Render a chat bubble
  const renderBubble = (msg: typeof chatMessages[0]) => {
    const isUser = msg.from === "user";
    const emp = isUser ? null : empMap.get(msg.from);
    const color = emp?.color ?? "var(--accent)";
    const name = isUser ? "You" : emp?.name?.split(" ")[0] ?? msg.from;
    return (
      <div key={msg.id} style={{
        display: "flex", flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 2, padding: "0 4px" }}>
          <span style={{ fontWeight: 600, color: isUser ? "var(--text-secondary)" : color }}>{name}</span>
          {" · "}
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div style={{
          maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
          background: isUser ? "var(--accent)" : "var(--bg-card)",
          color: isUser ? "#fff" : "var(--text-primary)",
          fontSize: 12, lineHeight: 1.5, wordBreak: "break-word",
          borderBottomRightRadius: isUser ? 4 : 12,
          borderBottomLeftRadius: isUser ? 12 : 4,
        }}>
          {msg.message}
        </div>
      </div>
    );
  };

  // Render activity entry
  const renderActivityEntry = (entry: ActivityEntry, i: number, arr: ActivityEntry[]) => {
    const emp = empMap.get(entry.agentId);
    const color = emp?.color ?? "var(--accent)";
    const isToolStart = entry.type === "tool_start";
    const isToolEnd = entry.type === "tool_end";
    const isText = entry.type === "text";
    const isAgentEnd = entry.type === "agent_end";
    const isLast = i === arr.length - 1;
    const toolName = entry.toolName?.toLowerCase() ?? "";
    const isFileOp = isToolStart && ["edit", "write", "read", "create", "file_edit", "file_write", "file_read"].some(t => toolName.includes(t));
    const isBash = isToolStart && toolName.includes("bash");
    const filePath = entry.toolArgs?.file_path ?? entry.toolArgs?.path ?? entry.toolArgs?.file ?? "";

    let label = "", detail = "", codeBlock = "", diffOld = "", diffNew = "";
    let diffCount = 0;
    if (isToolStart && isFileOp) {
      const isWrite = toolName.includes("write") || toolName.includes("create");
      const isEdit = toolName.includes("edit");
      label = isWrite ? "Write" : isEdit ? "Edit" : "Read";
      detail = typeof filePath === "string" ? filePath : "";
      if (isEdit) {
        const os = entry.toolArgs?.old_string ?? "";
        const ns = entry.toolArgs?.new_string ?? "";
        if (typeof os === "string") diffOld = os.length > 200 ? os.slice(0, 197) + "…" : os;
        if (typeof ns === "string") diffNew = ns.length > 200 ? ns.slice(0, 197) + "…" : ns;
        diffCount = typeof ns === "string" ? ns.split("\n").length : 0;
      } else {
        const content = entry.toolArgs?.content ?? "";
        if (typeof content === "string" && content.length > 0) {
          diffNew = content.length > 300 ? content.slice(0, 297) + "…" : content;
          diffCount = content.split("\n").length;
        }
      }
    } else if (isToolStart && isBash) {
      label = "Bash";
      const cmd = entry.toolArgs?.command ?? "";
      detail = String(entry.toolArgs?.description ?? "");
      if (typeof cmd === "string" && cmd.length > 0) codeBlock = cmd.length > 300 ? cmd.slice(0, 297) + "…" : cmd;
    } else if (isToolStart) {
      label = entry.toolName ?? "tool";
      if (entry.toolArgs) {
        const args = Object.entries(entry.toolArgs);
        if (args.length > 0) detail = args.map(([k, v]) => {
          const s = typeof v === "string" ? v : JSON.stringify(v);
          return `${k}: ${s && s.length > 60 ? s.slice(0, 57) + "…" : s}`;
        }).join(", ");
      }
    } else if (isToolEnd) {
      label = `${entry.toolName ?? "tool"} failed`;
      if (entry.toolResult) detail = entry.toolResult.length > 120 ? entry.toolResult.slice(0, 117) + "…" : entry.toolResult;
    } else if (isText) {
      label = "output";
      detail = entry.content.length > 200 ? entry.content.slice(0, 197) + "…" : entry.content;
    } else if (isAgentEnd) {
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 6px 2px" }}>
          <div style={{ width: 20, display: "flex", justifyContent: "center" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 4px var(--green)" }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)" }}>✓ done</span>
          <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
      );
    }

    const dotSize = isToolStart ? 8 : 5;
    const dotBg = isToolEnd ? "var(--red)" : color;
    const dotBorder = isToolStart ? `2px solid ${color}` : "none";
    const dotFill = isToolStart ? "transparent" : dotBg;
    const prevAgent = i > 0 ? arr[i - 1].agentId : null;
    const showAgent = entry.agentId !== prevAgent;

    return (
      <div key={i}>
        {showAgent && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0 3px 2px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}` }} />
            <span style={{ fontSize: 10, fontWeight: 700, color }}>{emp?.name?.split(" ")[0] ?? entry.agentId}</span>
            {activeAgents[entry.agentId] && (
              <span style={{ display: "flex", gap: 2, marginLeft: 2 }}>
                <span className="office-typing-dot" style={{ background: color }} />
                <span className="office-typing-dot" style={{ background: color }} />
                <span className="office-typing-dot" style={{ background: color }} />
              </span>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 0, minHeight: 22 }}>
          <div style={{ width: 20, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{
              width: dotSize, height: dotSize, borderRadius: "50%",
              background: dotFill, border: dotBorder, marginTop: 5, flexShrink: 0,
              boxShadow: (isToolStart || isText) ? `0 0 5px ${color}` : "none",
            }} />
            {!isLast && <div style={{ width: 1, flex: 1, minHeight: 4, background: "var(--border)" }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 3, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10.5, fontWeight: 600,
                color: isFileOp ? "var(--accent)" : isBash ? "var(--green)" : isToolEnd && entry.isError ? "var(--red)" : "var(--text-primary)",
              }}>{label}</span>
              {isFileOp && detail && (
                <span style={{
                  fontSize: 10, color: "var(--text-secondary)",
                  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
                }}>{detail.split("/").pop()}</span>
              )}
              <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto", flexShrink: 0 }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            {isFileOp && (detail || diffOld || diffNew) && (
              <div style={{ marginTop: 4, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-primary)" }}>
                {detail && (
                  <div style={{
                    padding: "4px 8px", display: "flex", alignItems: "center", gap: 6,
                    borderBottom: (diffOld || diffNew) ? "1px solid var(--border)" : "none",
                    fontSize: 10, color: "var(--text-secondary)",
                  }}>
                    <FileText size={11} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                    <span style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace", fontWeight: 500 }}>{detail.split("/").pop()}</span>
                    {diffCount > 0 && <span style={{ color: "var(--green)", fontWeight: 600, fontSize: 10 }}>+{diffCount}</span>}
                  </div>
                )}
                <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 10.5, lineHeight: 1.6, fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}>
                  {diffOld && diffOld.split("\n").map((line, li) => (
                    <div key={`o${li}`} style={{ padding: "0 8px", background: "rgba(232,100,90,0.1)", color: "var(--red)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line || " "}</div>
                  ))}
                  {diffNew && diffNew.split("\n").map((line, li) => (
                    <div key={`n${li}`} style={{ padding: "0 8px", background: "rgba(74,192,131,0.1)", color: "var(--green)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line || " "}</div>
                  ))}
                </div>
              </div>
            )}
            {isBash && codeBlock && (
              <div style={{
                marginTop: 4, padding: "6px 8px", borderRadius: 6,
                background: "var(--bg-primary)", border: "1px solid var(--border)",
                fontSize: 10, lineHeight: 1.5, fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                maxHeight: 80, overflowY: "auto",
              }}>{codeBlock}</div>
            )}
            {!isFileOp && !isBash && detail && (
              <div style={{
                fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4, marginTop: 1,
                fontFamily: isText ? "inherit" : "'Cascadia Code', 'Fira Code', monospace",
                whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 44, overflow: "hidden",
              }}>{detail}</div>
            )}
            {isBash && detail && !codeBlock && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{detail}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Build the timeline: chat bubbles interleaved with live activity blocks ──
  // Group: user msg → [live activity while agent works] → agent response
  // We render all chat messages in order, and insert the live activity block
  // between the last user message and the next agent response (or at the end if still active).

  const hasActivity = filteredActivity.length > 0;
  const showLiveBlock = hasActivity && (anyActive || liveExpanded);

  return (
    <>
      {/* Chat messages */}
      {chatMessages.map((msg, idx) => {
        const isUser = msg.from === "user";
        const nextMsg = chatMessages[idx + 1];
        const isLastUserBeforeAgent = isUser && nextMsg && nextMsg.from !== "user";
        const isLastMsg = idx === chatMessages.length - 1;

        return (
          <div key={msg.id}>
            {renderBubble(msg)}

            {/* Show live activity between user message and agent response */}
            {isLastUserBeforeAgent && hasActivity && (
              <div style={{
                margin: "4px 0 8px", borderRadius: 8, overflow: "hidden",
                border: "1px solid var(--border)", background: "var(--bg-primary)",
              }}>
                <button onClick={() => setLiveExpanded(!liveExpanded)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", background: "none", border: "none",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: anyActive ? "var(--green)" : "var(--text-muted)",
                    boxShadow: anyActive ? "0 0 6px var(--green)" : "none",
                    animation: anyActive ? "pulse-dot 2s ease-in-out infinite" : "none",
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)" }}>
                    {anyActive ? "Working…" : `${filteredActivity.length} steps`}
                  </span>
                  {anyActive && activeKeys.map(k => {
                    const e = empMap.get(k);
                    return (
                      <span key={k} style={{
                        fontSize: 9, fontWeight: 600, padding: "0 6px", borderRadius: 8,
                        background: `${e?.color ?? "var(--accent)"}18`, color: e?.color ?? "var(--accent)",
                      }}>{e?.name?.split(" ")[0] ?? k}</span>
                    );
                  })}
                  <ChevronRight size={12} style={{
                    marginLeft: "auto", color: "var(--text-muted)",
                    transform: liveExpanded ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                  }} />
                </button>
                {liveExpanded && (
                  <div style={{ padding: "2px 8px 6px", borderTop: "1px solid var(--border)" }}>
                    {filteredActivity.map((e, i, a) => renderActivityEntry(e, i, a))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* If agent is still active (no response yet), show live block at the end */}
      {hasActivity && anyActive && chatMessages.length > 0 && chatMessages[chatMessages.length - 1].from === "user" && (
        <div style={{
          margin: "4px 0 8px", borderRadius: 8, overflow: "hidden",
          border: `1px solid ${anyActive ? "var(--green)" : "var(--border)"}`,
          background: "var(--bg-primary)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", background: "var(--green)",
              boxShadow: "0 0 6px var(--green)", animation: "pulse-dot 2s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--green)" }}>Working…</span>
            {activeKeys.map(k => {
              const e = empMap.get(k);
              return (
                <span key={k} style={{
                  fontSize: 9, fontWeight: 600, padding: "0 6px", borderRadius: 8,
                  background: `${e?.color ?? "var(--accent)"}18`, color: e?.color ?? "var(--accent)",
                }}>{e?.name?.split(" ")[0] ?? k}</span>
              );
            })}
          </div>
          <div style={{ padding: "2px 8px 6px", borderTop: "1px solid var(--border)" }}>
            {filteredActivity.map((e, i, a) => renderActivityEntry(e, i, a))}
          </div>
        </div>
      )}

      {/* If there's activity but no chat messages yet (e.g. agent started on its own) */}
      {hasActivity && chatMessages.length === 0 && (
        <div style={{
          margin: "4px 0 8px", borderRadius: 8, overflow: "hidden",
          border: "1px solid var(--border)", background: "var(--bg-primary)",
        }}>
          <button onClick={() => setLiveExpanded(!liveExpanded)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", background: "none", border: "none",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: anyActive ? "var(--green)" : "var(--text-muted)",
              boxShadow: anyActive ? "0 0 6px var(--green)" : "none",
              animation: anyActive ? "pulse-dot 2s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: anyActive ? "var(--green)" : "var(--text-secondary)" }}>
              {anyActive ? "Working…" : `${filteredActivity.length} steps`}
            </span>
            <ChevronRight size={12} style={{
              marginLeft: "auto", color: "var(--text-muted)",
              transform: liveExpanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }} />
          </button>
          {liveExpanded && (
            <div style={{ padding: "2px 8px 6px", borderTop: "1px solid var(--border)" }}>
              {filteredActivity.map((e, i, a) => renderActivityEntry(e, i, a))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── File Tree Component ──────────────────────────────────────────────────────

function FileTreeNode({ entries, expanded, toggleFolder, openFile, activeFile, depth }: {
  entries: TreeEntry[];
  expanded: Set<string>;
  toggleFolder: (path: string) => void;
  openFile: (entry: TreeEntry) => void;
  activeFile: string;
  depth: number;
}) {
  // Sort: folders first, then files, alphabetical
  const sorted = useMemo(() =>
    [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  [entries]);

  return (
    <>
      {sorted.map(entry => {
        const isFolder = entry.type === "folder";
        const isOpen = expanded.has(entry.path);
        const isActive = entry.path === activeFile;
        const pl = 10 + depth * 14;

        return (
          <div key={entry.path}>
            <button
              onClick={() => isFolder ? toggleFolder(entry.path) : openFile(entry)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 4,
                padding: `3px 8px 3px ${pl}px`,
                background: isActive ? "var(--accent-subtle)" : "transparent",
                border: "none", color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: 11.5, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                borderLeft: isActive ? `2px solid var(--accent)` : "2px solid transparent",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              {isFolder ? (
                isOpen ? <ChevronDown size={12} style={{ flexShrink: 0 }} /> : <ChevronRight size={12} style={{ flexShrink: 0 }} />
              ) : (
                <span style={{ width: 12, flexShrink: 0 }} />
              )}
              <span style={{ flexShrink: 0, color: isFolder ? "var(--accent)" : "var(--text-muted)", display: "flex" }}>
                {isFolder ? (isOpen ? <FolderOpen size={13} /> : <Folder size={13} />) : getFileIcon(entry.name, 13)}
              </span>
              <span style={{
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontWeight: isFolder ? 500 : 400,
              }}>
                {entry.name}
              </span>
            </button>
            {isFolder && isOpen && entry.children && (
              <FileTreeNode entries={entry.children} expanded={expanded}
                toggleFolder={toggleFolder} openFile={openFile}
                activeFile={activeFile} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}

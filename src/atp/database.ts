/**
 * SQLite-backed Agent Task Portal database.
 * Stores tasks with status, assignments, priorities, and results.
 * Also manages the employee registry.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { loadRoster } from "../ar/roster.js";
import {
  Priority,
  TaskStatus,
  EmployeeStatus,
  type Task,
  type Employee,
  type Reminder,
} from "./models.js";

const DB_PATH = path.join(config.dataDir, "atp.db");

function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  let db: Database.Database;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    // Corrupt database — rename and start fresh
    const backup = `${DB_PATH}.corrupt.${Date.now()}`;
    console.warn(`  [DB] Database corrupt, backing up to ${backup} and starting fresh: ${(err as Error).message}`);
    try { fs.renameSync(DB_PATH, backup); } catch { /* ignore rename failure */ }
    db = new Database(DB_PATH);
  }
  db.pragma("journal_mode = WAL");
  return db;
}

function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id        TEXT PRIMARY KEY,
      description    TEXT NOT NULL,
      agent_id       TEXT NOT NULL,
      priority       TEXT NOT NULL DEFAULT 'medium',
      status         TEXT NOT NULL DEFAULT 'pending',
      folder_access  TEXT DEFAULT '',
      scheduled_date TEXT DEFAULT '',
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      result         TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS employees (
      employee_id     TEXT PRIMARY KEY,
      agent_id        TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      designation     TEXT NOT NULL,
      department      TEXT NOT NULL,
      hierarchy_level INTEGER NOT NULL DEFAULT 3,
      reports_to      TEXT DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'available',
      skills          TEXT DEFAULT '',
      joined_at       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      reminder_id    TEXT PRIMARY KEY,
      agent_id       TEXT NOT NULL,
      message        TEXT NOT NULL,
      scheduled_for  TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      triggered_at   TEXT DEFAULT ''
    );
  `);
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    task_id: row.task_id as string,
    description: row.description as string,
    agent_id: row.agent_id as string,
    priority: (row.priority as string) as Priority,
    status: (row.status as string) as TaskStatus,
    folder_access: (row.folder_access as string) || "",
    scheduled_date: (row.scheduled_date as string) || "",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    result: (row.result as string) || "",
  };
}

function rowToReminder(row: Record<string, unknown>): Reminder {
  return {
    reminder_id: row.reminder_id as string,
    agent_id: row.agent_id as string,
    message: row.message as string,
    scheduled_for: row.scheduled_for as string,
    created_at: row.created_at as string,
    triggered_at: (row.triggered_at as string) || "",
  };
}

function rowToEmployee(row: Record<string, unknown>): Employee {
  return {
    employee_id: row.employee_id as string,
    agent_id: row.agent_id as string,
    name: row.name as string,
    designation: row.designation as string,
    department: row.department as string,
    hierarchy_level: row.hierarchy_level as number,
    reports_to: (row.reports_to as string) || "",
    status: (row.status as string) as EmployeeStatus,
    skills: (row.skills as string) || "",
    joined_at: row.joined_at as string,
  };
}

/** Build seed data from roster.json — no more hardcoded employee list. */
function getSeedEmployees() {
  return loadRoster().agents.filter((e) => e.enabled).map((e) => ({
    employee_id: e.employee_id,
    agent_id: e.agent_id,
    name: e.name,
    designation: e.designation,
    department: e.department,
    hierarchy_level: e.hierarchy_level,
    reports_to: e.reports_to,
    skills: e.skills.join(","),
  }));
}

class ATPDatabaseClass {
  private db: Database.Database;

  constructor() {
    this.db = openDb();
    initDb(this.db);
    this.migrateDb();
    this.seedEmployees();
  }

  private migrateDb(): void {
    // Add scheduled_date column to existing databases that predate this field.
    try {
      this.db.exec("ALTER TABLE tasks ADD COLUMN scheduled_date TEXT DEFAULT ''");
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // ── Task ID generation ──────────────────────────────────────────────────────

  getNextTaskId(): string {
    const row = this.db
      .prepare("SELECT task_id FROM tasks ORDER BY task_id DESC LIMIT 1")
      .get() as { task_id: string } | undefined;
    if (!row) return "TASK-001";
    const num = parseInt(row.task_id.split("-")[1], 10);
    return `TASK-${String(num + 1).padStart(3, "0")}`;
  }

  // ── Task CRUD ──────────────────────────────────────────────────────────────

  createTask(
    description: string,
    agent_id: string,
    priority: string = "medium",
    folder_access: string = "",
    scheduled_date: string = ""
  ): Task {
    const task_id = this.getNextTaskId();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tasks (task_id, description, agent_id, priority, status, folder_access, scheduled_date, created_at, updated_at, result)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, '')
    `).run(task_id, description, agent_id.trim().toLowerCase(), priority, folder_access, scheduled_date, now, now);
    return this.getTask(task_id)!;
  }

  updateTaskScheduledDate(task_id: string, scheduled_date: string): Task | undefined {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE tasks SET scheduled_date = ?, updated_at = ? WHERE task_id = ?")
      .run(scheduled_date, now, task_id.trim().toUpperCase());
    return this.getTask(task_id);
  }

  /** Return all pending tasks whose scheduled_date is today or earlier (due for release). */
  getDueTasks(): Task[] {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE status = 'pending' AND scheduled_date != '' AND scheduled_date <= ?`)
      .all(today) as Record<string, unknown>[];
    return rows.map(rowToTask);
  }

  getTask(task_id: string): Task | undefined {
    const row = this.db
      .prepare("SELECT * FROM tasks WHERE task_id = ?")
      .get(task_id.trim().toUpperCase()) as Record<string, unknown> | undefined;
    return row ? rowToTask(row) : undefined;
  }

  getTasksForAgent(agent_id: string, status?: string): Task[] {
    let rows: Record<string, unknown>[];
    if (status) {
      rows = this.db
        .prepare("SELECT * FROM tasks WHERE agent_id = ? AND status = ? ORDER BY priority, created_at")
        .all(agent_id.toLowerCase(), status) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM tasks WHERE agent_id = ? ORDER BY priority, created_at")
        .all(agent_id.toLowerCase()) as Record<string, unknown>[];
    }
    return rows.map(rowToTask);
  }

  updateTaskStatus(task_id: string, status: string, result = ""): Task | undefined {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE tasks SET status = ?, result = ?, updated_at = ? WHERE task_id = ?")
      .run(status, result, now, task_id.trim().toUpperCase());
    return this.getTask(task_id);
  }

  getAllTasks(status?: string): Task[] {
    let rows: Record<string, unknown>[];
    if (status) {
      rows = this.db
        .prepare("SELECT * FROM tasks WHERE status = ? ORDER BY priority, created_at")
        .all(status) as Record<string, unknown>[];
    } else {
      rows = this.db
        .prepare("SELECT * FROM tasks ORDER BY status, priority, created_at")
        .all() as Record<string, unknown>[];
    }
    return rows.map(rowToTask);
  }

  deleteTask(task_id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM tasks WHERE task_id = ?")
      .run(task_id.trim().toUpperCase());
    return result.changes > 0;
  }

  clearAllTasks(): number {
    const result = this.db.prepare("DELETE FROM tasks").run();
    return result.changes;
  }

  /** Reset all employee statuses to 'available' (used by company reset). */
  resetEmployeeStatuses(): void {
    this.db.prepare("UPDATE employees SET status = 'available'").run();
  }

  taskBoard(): string {
    const tasks = this.getAllTasks();
    if (!tasks.length) return "No tasks in ATP.";
    const header = `${"ID".padEnd(10)} ${"Agent".padEnd(8)} ${"Priority".padEnd(8)} ${"Status".padEnd(14)} Description`;
    const separator = "-".repeat(70);
    const rows = tasks.map(
      (t) =>
        `${t.task_id.padEnd(10)} ${t.agent_id.padEnd(8)} ${t.priority.padEnd(8)} ${t.status.padEnd(14)} ${t.description.substring(0, 35)}`
    );
    return [header, separator, ...rows].join("\n");
  }

  // ── Employee Registry ──────────────────────────────────────────────────────

  getNextEmployeeId(): string {
    const row = this.db
      .prepare("SELECT employee_id FROM employees ORDER BY employee_id DESC LIMIT 1")
      .get() as { employee_id: string } | undefined;
    if (!row) return "EMP-001";
    const num = parseInt(row.employee_id.split("-")[1], 10);
    return `EMP-${String(num + 1).padStart(3, "0")}`;
  }

  registerEmployee(opts: {
    agent_id: string;
    name: string;
    designation: string;
    department: string;
    hierarchy_level: number;
    reports_to?: string;
    skills?: string;
    employee_id?: string;
  }): Employee {
    const existing = this.db
      .prepare("SELECT employee_id FROM employees WHERE agent_id = ?")
      .get(opts.agent_id.trim().toLowerCase()) as { employee_id: string } | undefined;
    if (existing) return this.getEmployeeByAgentId(opts.agent_id)!;

    const eid = opts.employee_id ?? this.getNextEmployeeId();

    // Check if employee_id is already taken by a different agent (e.g. auto-generated during runtime hire)
    const eidTaken = this.db
      .prepare("SELECT agent_id FROM employees WHERE employee_id = ?")
      .get(eid) as { agent_id: string } | undefined;
    if (eidTaken) {
      // employee_id conflict — generate a fresh one instead
      const freshEid = this.getNextEmployeeId();
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO employees (employee_id, agent_id, name, designation, department, hierarchy_level, reports_to, status, skills, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)
      `).run(
        freshEid,
        opts.agent_id.trim().toLowerCase(),
        opts.name,
        opts.designation,
        opts.department,
        opts.hierarchy_level,
        opts.reports_to ?? "",
        opts.skills ?? "",
        now
      );
      return this.getEmployee(freshEid)!;
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO employees (employee_id, agent_id, name, designation, department, hierarchy_level, reports_to, status, skills, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)
    `).run(
      eid,
      opts.agent_id.trim().toLowerCase(),
      opts.name,
      opts.designation,
      opts.department,
      opts.hierarchy_level,
      opts.reports_to ?? "",
      opts.skills ?? "",
      now
    );
    return this.getEmployee(eid)!;
  }

  getEmployee(employee_id: string): Employee | undefined {
    const row = this.db
      .prepare("SELECT * FROM employees WHERE employee_id = ?")
      .get(employee_id.trim().toUpperCase()) as Record<string, unknown> | undefined;
    return row ? rowToEmployee(row) : undefined;
  }

  getEmployeeByAgentId(agent_id: string): Employee | undefined {
    const row = this.db
      .prepare("SELECT * FROM employees WHERE agent_id = ?")
      .get(agent_id.trim().toLowerCase()) as Record<string, unknown> | undefined;
    return row ? rowToEmployee(row) : undefined;
  }

  listEmployees(opts: { status?: string; department?: string } = {}): Employee[] {
    let query = "SELECT * FROM employees WHERE 1=1";
    const params: string[] = [];
    if (opts.status) { query += " AND status = ?"; params.push(opts.status); }
    if (opts.department) { query += " AND department = ?"; params.push(opts.department); }
    query += " ORDER BY hierarchy_level, employee_id";
    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(rowToEmployee);
  }

  updateEmployeeStatus(agent_id: string, status: string): Employee | undefined {
    this.db
      .prepare("UPDATE employees SET status = ? WHERE agent_id = ?")
      .run(status, agent_id.trim().toLowerCase());
    return this.getEmployeeByAgentId(agent_id);
  }

  updateEmployeeName(agent_id: string, name: string): Employee | undefined {
    this.db
      .prepare("UPDATE employees SET name = ? WHERE agent_id = ?")
      .run(name.trim(), agent_id.trim().toLowerCase());
    return this.getEmployeeByAgentId(agent_id);
  }

  removeEmployee(agent_id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM employees WHERE agent_id = ?")
      .run(agent_id.trim().toLowerCase());
    return result.changes > 0;
  }

  getDirectReports(employee_id: string): Employee[] {
    const rows = this.db
      .prepare("SELECT * FROM employees WHERE reports_to = ? ORDER BY hierarchy_level, employee_id")
      .all(employee_id.trim().toUpperCase()) as Record<string, unknown>[];
    return rows.map(rowToEmployee);
  }

  orgChart(): string {
    const employees = this.listEmployees();
    if (!employees.length) return "No employees registered.";
    const byId = new Map(employees.map((e) => [e.employee_id, e]));
    const lines: string[] = ["VEC - Virtual Employed Company  |  Org Chart", "=".repeat(55)];
    const icons: Record<string, string> = { available: "[+]", busy: "[~]", offline: "[-]" };

    const render = (empId: string, indent: number): void => {
      const emp = byId.get(empId);
      if (!emp) return;
      const icon = icons[emp.status] ?? "[?]";
      const prefix = "  ".repeat(indent) + (indent > 0 ? "|-- " : "");
      lines.push(`${prefix}${icon} [${emp.employee_id}] ${emp.name}  -  ${emp.designation}  (${emp.department})`);
      const reports = employees
        .filter((e) => e.reports_to === empId)
        .sort((a, b) => a.hierarchy_level - b.hierarchy_level);
      for (const r of reports) render(r.employee_id, indent + 1);
    };

    const roots = employees.filter((e) => !e.reports_to);
    for (const root of roots) render(root.employee_id, 0);
    lines.push("", `Total: ${employees.length} employee(s)`);
    return lines.join("\n");
  }

  employeeDirectory(opts: { status?: string; department?: string } = {}): string {
    const employees = this.listEmployees(opts);
    if (!employees.length) return "No employees found.";
    const header = `${"EMP-ID".padEnd(9)} ${"Agent".padEnd(7)} ${"Name".padEnd(18)} ${"Designation".padEnd(22)} ${"Dept".padEnd(14)} ${"Lvl".padEnd(4)} ${"Status".padEnd(10)} Skills`;
    const separator = "-".repeat(105);
    const rows = employees.map(
      (e) =>
        `${e.employee_id.padEnd(9)} ${e.agent_id.padEnd(7)} ${e.name.padEnd(18)} ${e.designation.padEnd(22)} ` +
        `${e.department.padEnd(14)} ${String(e.hierarchy_level).padEnd(4)} ${e.status.padEnd(10)} ${e.skills.substring(0, 30)}`
    );
    return [header, separator, ...rows].join("\n");
  }

  // ── Reminders ────────────────────────────────────────────────────────────

  getNextReminderId(): string {
    const row = this.db
      .prepare("SELECT reminder_id FROM reminders ORDER BY reminder_id DESC LIMIT 1")
      .get() as { reminder_id: string } | undefined;
    if (!row) return "REM-001";
    const num = parseInt(row.reminder_id.split("-")[1], 10);
    return `REM-${String(num + 1).padStart(3, "0")}`;
  }

  createReminder(agent_id: string, message: string, scheduled_for: string): Reminder {
    const reminder_id = this.getNextReminderId();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO reminders (reminder_id, agent_id, message, scheduled_for, created_at, triggered_at)
      VALUES (?, ?, ?, ?, ?, '')
    `).run(reminder_id, agent_id.trim().toLowerCase(), message, scheduled_for, now);
    return this.getReminder(reminder_id)!;
  }

  getReminder(reminder_id: string): Reminder | undefined {
    const row = this.db
      .prepare("SELECT * FROM reminders WHERE reminder_id = ?")
      .get(reminder_id.trim().toUpperCase()) as Record<string, unknown> | undefined;
    return row ? rowToReminder(row) : undefined;
  }

  getRemindersForAgent(agent_id: string, includeTriggered = false): Reminder[] {
    const query = includeTriggered
      ? "SELECT * FROM reminders WHERE agent_id = ? ORDER BY scheduled_for"
      : "SELECT * FROM reminders WHERE agent_id = ? AND triggered_at = '' ORDER BY scheduled_for";
    const rows = this.db.prepare(query).all(agent_id.trim().toLowerCase()) as Record<string, unknown>[];
    return rows.map(rowToReminder);
  }

  getAllReminders(includeTriggered = false): Reminder[] {
    const query = includeTriggered
      ? "SELECT * FROM reminders ORDER BY scheduled_for"
      : "SELECT * FROM reminders WHERE triggered_at = '' ORDER BY scheduled_for";
    const rows = this.db.prepare(query).all() as Record<string, unknown>[];
    return rows.map(rowToReminder);
  }

  /** Return all untriggered reminders whose scheduled_for is now or in the past. */
  getDueReminders(): Reminder[] {
    const now = new Date().toISOString();
    const rows = this.db
      .prepare("SELECT * FROM reminders WHERE triggered_at = '' AND scheduled_for <= ? ORDER BY scheduled_for")
      .all(now) as Record<string, unknown>[];
    return rows.map(rowToReminder);
  }

  markReminderTriggered(reminder_id: string): Reminder | undefined {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE reminders SET triggered_at = ? WHERE reminder_id = ?")
      .run(now, reminder_id.trim().toUpperCase());
    return this.getReminder(reminder_id);
  }

  deleteReminder(reminder_id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM reminders WHERE reminder_id = ?")
      .run(reminder_id.trim().toUpperCase());
    return result.changes > 0;
  }

  private seedEmployees(): void {
    // Agents without a live process — they appear in the directory as offline so PM
    // knows not to contact them. Add an agent_id here to remove it from PM's roster.
    const OFFLINE_AGENTS = new Set<string>([]);

    for (const emp of getSeedEmployees()) {
      this.registerEmployee(emp);
      // Update name if it changed (keeps existing records in sync with new seed data)
      this.db
        .prepare("UPDATE employees SET name = ? WHERE agent_id = ? AND name != ?")
        .run(emp.name, emp.agent_id, emp.name);
      // Force ghost agents offline every startup so PM never messages them
      if (OFFLINE_AGENTS.has(emp.agent_id)) {
        this.db
          .prepare("UPDATE employees SET status = 'offline' WHERE agent_id = ?")
          .run(emp.agent_id);
      }
    }
  }
}

// Singleton instance
export const ATPDatabase = new ATPDatabaseClass();
export type ATPDatabaseType = ATPDatabaseClass;

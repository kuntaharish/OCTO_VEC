/**
 * JSON file-backed FIFO message queue for the PM Agent.
 * Agents push messages here; PM reads and pops them when free.
 */

import fs from "fs";
import path from "path";
import { config } from "../config.js";
import type { Message } from "./models.js";
import { MessageType } from "./models.js";
import { log } from "./logger.js";

const L = log.for("messageQueue");
const QUEUE_PATH = path.join(config.dataDir, "pm_queue.json");

function ensureFile(): void {
  if (!fs.existsSync(QUEUE_PATH)) {
    try {
      fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
      fs.writeFileSync(QUEUE_PATH, "[]", "utf-8");
    } catch (err) {
      L.error("Failed to create PM queue file", err, { path: QUEUE_PATH });
    }
  }
}

function read(): Message[] {
  ensureFile();
  try {
    const text = fs.readFileSync(QUEUE_PATH, "utf-8").trim();
    if (!text) return [];
    return JSON.parse(text) as Message[];
  } catch (err) {
    L.error("Failed to read PM queue — returning empty queue", err, { path: QUEUE_PATH });
    return [];
  }
}

function write(data: Message[]): void {
  ensureFile();
  try {
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    L.error("Failed to write PM queue — messages may be lost", err, { path: QUEUE_PATH, count: data.length });
  }
}

export const MessageQueue = {
  push(msg: Message): void {
    const data = read();
    data.push(msg);
    write(data);
  },

  pushSimple(
    from_agent: string,
    task_id: string,
    message: string,
    msg_type: string = "status_update"
  ): void {
    this.push({
      from_agent,
      task_id,
      type: msg_type as MessageType,
      message,
      timestamp: new Date().toISOString(),
    });
  },

  peek(): Message[] {
    return read();
  },

  pop(count = 1): Message[] {
    const data = read();
    if (!data.length) return [];
    const popped = data.splice(0, count);
    write(data);
    return popped;
  },

  popAll(): Message[] {
    const data = read();
    if (!data.length) return [];
    write([]);
    return data;
  },

  isEmpty(): boolean {
    return read().length === 0;
  },

  count(): number {
    return read().length;
  },

  clear(): void {
    write([]);
  },
};

export type MessageQueueType = typeof MessageQueue;

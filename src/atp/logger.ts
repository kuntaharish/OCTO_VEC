/**
 * VEC structured logger.
 *
 * Wraps console.log/warn/error with a consistent format:
 *   [timestamp] [LEVEL] [component] message  {context?}
 *
 * Usage:
 *   import { log } from "../atp/logger.js";
 *   const L = log.for("channelManager");
 *   L.info("Channel started", { channel: "telegram" });
 *   L.warn("Reconnecting", { channel: "whatsapp", attempt: 2 });
 *   L.error("Failed to send", err, { agent: "pm", taskId: "TASK-001" });
 */

function ts(): string {
  return new Date().toISOString();
}

function fmt(level: string, component: string, msg: string, ctx?: Record<string, unknown>): string {
  const ctxStr = ctx && Object.keys(ctx).length ? "  " + JSON.stringify(ctx) : "";
  return `${ts()} [${level}] [${component}] ${msg}${ctxStr}`;
}

export interface ComponentLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
}

function forComponent(component: string): ComponentLogger {
  return {
    info(msg, ctx) {
      console.log(fmt("INFO ", component, msg, ctx));
    },
    warn(msg, ctx) {
      console.warn(fmt("WARN ", component, msg, ctx));
    },
    error(msg, err, ctx) {
      const errDetail = err instanceof Error
        ? { error: err.message, stack: err.stack?.split("\n").slice(0, 4).join(" | ") }
        : err !== undefined ? { error: String(err) } : {};
      console.error(fmt("ERROR", component, msg, { ...errDetail, ...ctx }));
    },
    debug(msg, ctx) {
      if (process.env.VEC_DEBUG) console.log(fmt("DEBUG", component, msg, ctx));
    },
  };
}

export const log = { for: forComponent };

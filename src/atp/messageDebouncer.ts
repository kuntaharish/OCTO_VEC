/**
 * MessageDebouncer — per-key batching debouncer for inbound user messages.
 *
 * Rapid messages within the debounce window collapse into a single flush.
 * The inbox (peek-based) already accumulates all messages during the window,
 * so the single flush processes the full batch naturally.
 *
 * Priority messages and control commands pass `bypass=true` to flush immediately.
 */

export interface DebounceConfig {
  /** Default debounce window in ms. Set to 0 to disable debouncing. Default: 1500. */
  defaultMs: number;
  /** Per-agent overrides, e.g. { pm: 2000, ba: 1000 } */
  byAgent?: Record<string, number>;
}

export class MessageDebouncer {
  private pending = new Map<string, { timer: NodeJS.Timeout; flush: () => void }>();
  private cfg: DebounceConfig;

  constructor(cfg: DebounceConfig) {
    this.cfg = cfg;
  }

  /**
   * Schedule a debounced flush for `key`.
   * - Resets the timer if one is already pending.
   * - If `bypass=true` (priority / control command), flushes immediately.
   * - If debounce is disabled (ms=0), flushes immediately.
   */
  schedule(key: string, onFlush: () => void, bypass = false): void {
    const ms = this.cfg.byAgent?.[key] ?? this.cfg.defaultMs;

    if (bypass || ms === 0) {
      this.cancel(key); // clear any pending timer for this key
      onFlush();
      return;
    }

    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this.pending.delete(key);
      onFlush();
    }, ms);

    this.pending.set(key, { timer, flush: onFlush });
  }

  /** Immediately flush a pending debounce for `key` (e.g. explicit send button). */
  flush(key: string): void {
    const entry = this.pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(key);
    entry.flush();
  }

  /** Cancel a pending debounce without flushing. */
  cancel(key: string): void {
    const entry = this.pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(key);
  }

  /** True if a debounce is currently pending for `key`. */
  hasPending(key: string): boolean {
    return this.pending.has(key);
  }
}

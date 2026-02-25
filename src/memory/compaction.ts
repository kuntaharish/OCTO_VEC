/**
 * Auto-compaction for agent conversation history.
 *
 * Returns a `transformContext` function for the Agent constructor that keeps
 * message history bounded to `maxMessages`. When the limit is exceeded, the
 * oldest messages are trimmed, always starting at a "user" role boundary so
 * we never split a tool-call / tool-result pair mid-way.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

const DEFAULT_MAX_MESSAGES = 40;

/**
 * Returns a transformContext-compatible function.
 * Pass directly to AgentOptions.transformContext.
 *
 * @param maxMessages  Keep at most this many messages (default 40).
 */
export function makeCompactionTransform(maxMessages: number = DEFAULT_MAX_MESSAGES) {
  return async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    if (messages.length <= maxMessages) return messages;

    // Trim oldest messages down to maxMessages
    const trimmed = messages.slice(messages.length - maxMessages);

    // Avoid starting mid-tool-exchange: skip forward until the first user message
    const firstUserIdx = trimmed.findIndex((m: any) => m.role === "user");
    return firstUserIdx > 0 ? trimmed.slice(firstUserIdx) : trimmed;
  };
}

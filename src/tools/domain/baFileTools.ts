/**
 * BA file tools — read, write, edit restricted to .md and .mmd (documentation) files only.
 * BA's role is writing documentation, not reading or modifying code files.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getCodingTools } from "../shared/fileTools.js";

const ALLOWED_EXTENSIONS = [".md", ".mmd"];

function isAllowed(filePath: string): boolean {
  const lower = (filePath ?? "").toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function blocked(toolName: string, filePath: string) {
  return {
    content: [{
      type: "text" as const,
      text:
        `BLOCKED: '${toolName}' is restricted to .md and .mmd files only.\n` +
        `'${filePath}' is not a documentation file.\n` +
        `BA role: write and edit documentation files (.md, .mmd). Reading or modifying code files is not your responsibility.\n` +
        `Save deliverables as .md files in shared/ or agents/ba/.`,
    }],
    details: {},
  };
}

function wrap(tool: AgentTool, toolName: string, descriptionOverride: string): AgentTool {
  return {
    ...tool,
    description: descriptionOverride,
    execute: async (ctx: any, params: any) => {
      const filePath: string = params?.path ?? params?.file_path ?? "";
      if (filePath && !isAllowed(filePath)) {
        return blocked(toolName, filePath);
      }
      return tool.execute(ctx, params);
    },
  };
}

export function getBAFileTools(): AgentTool[] {
  const base = getCodingTools();
  const byName = new Map(base.map((t) => [t.name, t]));

  return [
    wrap(
      byName.get("read")!,
      "read",
      "Read a .md or .mmd documentation file from disk. Only .md and .mmd files are permitted."
    ),
    wrap(
      byName.get("write")!,
      "write",
      "Write a .md or .mmd documentation file. Only .md and .mmd extensions are allowed — BA writes documentation, not code."
    ),
    wrap(
      byName.get("edit")!,
      "edit",
      "Make targeted edits to a .md or .mmd documentation file. Only .md and .mmd files are allowed."
    ),
    // bash intentionally excluded — BA does not run shell commands
  ];
}

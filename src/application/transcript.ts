import { join } from "node:path";
import type { ModelMessage, ToolResultPart } from "ai";

export const processingLabel = "Processing ...";

export type ToolBlock = {
  callId: string;
  lines: string[];
};

export type TranscriptBlock =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; tools: ToolBlock[] };

const maxEntries = 40;

export function transcriptBlocks(messages: readonly ModelMessage[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  const calls = new Map<string, PendingCall>();

  for (const message of messages) {
    if (message.role === "user") {
      const text = textOf(message);
      if (text) {
        blocks.push({ kind: "user", text });
      }
      continue;
    }

    if (message.role === "assistant") {
      rememberCalls(message, blocks, calls);
      continue;
    }

    if (message.role !== "tool") {
      continue;
    }

    for (const part of message.content) {
      if (part.type !== "tool-result") {
        continue;
      }
      attachResult(part, blocks, calls);
    }
  }

  return blocks;
}

type AssistantBlock = Extract<TranscriptBlock, { kind: "assistant" }>;

type PendingCall = {
  name: string;
  input: unknown;
  block?: AssistantBlock;
};

function rememberCalls(
  message: ModelMessage,
  blocks: TranscriptBlock[],
  calls: Map<string, PendingCall>,
): void {
  const text = textOf(message);
  const block = text ? pushAssistant(blocks, text) : undefined;
  if (typeof message.content === "string") {
    return;
  }

  for (const part of message.content) {
    if (part.type !== "tool-call") {
      continue;
    }
    calls.set(part.toolCallId, {
      name: part.toolName,
      input: part.input,
      block,
    });
  }
}

function attachResult(
  part: ToolResultPart,
  blocks: TranscriptBlock[],
  calls: Map<string, PendingCall>,
): void {
  const call = calls.get(part.toolCallId);
  const block = call?.block ?? pushAssistant(blocks, "");
  if (call && !call.block) {
    call.block = block;
  }
  block.tools.push({
    callId: part.toolCallId,
    lines: formatTool(call?.name ?? part.toolName, call?.input, part.output),
  });
}

function pushAssistant(blocks: TranscriptBlock[], text: string): AssistantBlock {
  const block: AssistantBlock = { kind: "assistant", text, tools: [] };
  blocks.push(block);
  return block;
}

function formatTool(name: string, input: unknown, output: ToolResultPart["output"]): string[] {
  const label = name.toLowerCase();
  if (output.type === "error-text") {
    return [`${label} failed`, output.value];
  }
  if (output.type !== "json") {
    return [`${label} done`];
  }
  if (label === "ls" && Array.isArray(output.value)) {
    return formatLs(input, output.value);
  }
  return [`${label} done`, ...formatValue(output.value)];
}

function formatLs(input: unknown, entries: readonly unknown[]): string[] {
  const directory = isRecord(input) && typeof input.path === "string" ? input.path : "";
  const lines = [`ls done`, "entries:"];
  const shown = entries.slice(0, maxEntries);
  for (const entry of shown) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = typeof entry.name === "string" ? entry.name : "";
    lines.push(`  name: ${name}`);
    lines.push(`  type: ${typeof entry.type === "string" ? entry.type : ""}`);
    if (directory && name) {
      lines.push(`  path: ${join(directory, name)}`);
    }
  }
  if (entries.length > shown.length) {
    lines.push("  …");
  }
  return lines;
}

function formatValue(value: unknown, indent = ""): string[] {
  if (Array.isArray(value)) {
    return value.slice(0, maxEntries).flatMap((item) => formatValue(item, `${indent}  `));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, child]) => {
      if (child !== null && typeof child === "object") {
        return [`${indent}${key}:`, ...formatValue(child, `${indent}  `)];
      }
      return [`${indent}${key}: ${String(child)}`];
    });
  }
  return [`${indent}${String(value)}`];
}

function textOf(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

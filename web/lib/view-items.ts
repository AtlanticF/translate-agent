import type { ModelMessage } from "ai";
import { visibleUserText } from "./imported-files";

export type ViewItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | {
      id: string;
      kind: "tool";
      name: string;
      state: "running" | "done" | "error";
      detail: string;
    };

export function viewItems(messages: readonly ModelMessage[]): ViewItem[] {
  const items: ViewItem[] = [];
  const tools = new Map<string, Extract<ViewItem, { kind: "tool" }>>();

  messages.forEach((message, index) => {
    if (message.role === "user") {
      const text = visibleUserText(textOf(message.content));
      if (text) {
        items.push({ id: `user-${index}`, kind: "user", text });
      }
      return;
    }

    if (message.role === "assistant") {
      const text = textOf(message.content);
      if (text) {
        items.push({ id: `assistant-${index}`, kind: "assistant", text });
      }
      if (!Array.isArray(message.content)) {
        return;
      }
      for (const part of message.content) {
        if (part.type !== "tool-call") {
          continue;
        }
        const item: Extract<ViewItem, { kind: "tool" }> = {
          id: part.toolCallId,
          kind: "tool",
          name: part.toolName,
          state: "running",
          detail: formatValue(part.input),
        };
        items.push(item);
        tools.set(part.toolCallId, item);
      }
      return;
    }

    if (message.role !== "tool") {
      return;
    }

    for (const part of message.content) {
      if (part.type !== "tool-result") {
        continue;
      }
      const result = resultText(part.output);
      const current = tools.get(part.toolCallId);
      if (current) {
        current.state = result.failed ? "error" : "done";
        current.detail = [current.detail, result.text].filter(Boolean).join("\n");
        continue;
      }
      items.push({
        id: part.toolCallId,
        kind: "tool",
        name: part.toolName,
        state: result.failed ? "error" : "done",
        detail: result.text,
      });
    }
  });

  return items;
}

export function toolTitle(item: Extract<ViewItem, { kind: "tool" }>): string {
  if (item.state === "error") {
    return `Failed to run ${item.name}`;
  }
  if (item.state === "done") {
    return `Ran ${item.name}`;
  }
  return `Running ${item.name}`;
}

function textOf(content: ModelMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}

function resultText(output: {
  type: string;
  value?: unknown;
  reason?: string;
}): { failed: boolean; text: string } {
  if (output.type === "error-text" || output.type === "error-json") {
    return { failed: true, text: formatValue(output.value) };
  }
  if (output.type === "execution-denied") {
    return { failed: true, text: output.reason ?? "denied" };
  }
  if ("value" in output) {
    return { failed: false, text: formatValue(output.value) };
  }
  return { failed: false, text: "" };
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

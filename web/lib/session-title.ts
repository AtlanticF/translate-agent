import type { ContextMessage } from "./session";

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export function sessionTitle(messages: readonly ContextMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user" || typeof message.content !== "string") {
      continue;
    }
    const text = message.content.trim();
    if (!text) {
      continue;
    }
    return text.length > 48 ? `${text.slice(0, 48)}…` : text;
  }
  return "New session";
}

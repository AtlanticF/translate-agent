import type { ContextMessage } from "./session";

export const maxSessionTitleLength = 80;

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

function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

export function normalizeSessionTitle(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const cleaned = cleanTitle(title);
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxSessionTitleLength);
}

export function readSessionTitle(
  value: unknown,
): { ok: true; title: string | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, title: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "title must be a string" };
  }
  const cleaned = cleanTitle(value);
  if (cleaned.length > maxSessionTitleLength) {
    return { ok: false, error: "title is too long" };
  }
  return { ok: true, title: cleaned || null };
}

export function displaySessionTitle(session: {
  title?: string | null;
  messages: readonly ContextMessage[];
}): string {
  return normalizeSessionTitle(session.title) ?? sessionTitle(session.messages);
}

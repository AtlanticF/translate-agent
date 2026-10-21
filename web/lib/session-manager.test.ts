import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createSessionManager } from "./session-manager";

test("creates a session with an id and no messages", () => {
  const manager = createSessionManager();
  const session = manager.createSession();

  expect(session.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  expect(session.messages).toEqual([]);
  expect(manager.getSession(session.id)).toEqual(session);
});

test("appends messages and keeps the stored list unchanged by callers", () => {
  const manager = createSessionManager();
  const session = manager.createSession();
  const message = { role: "user" as const, content: "hello" };

  const updated = manager.addMessages(session.id, [message]);
  updated.messages.push({ role: "user", content: "extra" });

  expect(manager.getSession(session.id)?.messages).toEqual([message]);
});

test("throws when adding messages to an unknown session", () => {
  const manager = createSessionManager();

  expect(() => manager.addMessages("missing", [])).toThrow(/unknown session: missing/);
  expect(manager.getSession("missing")).toBeUndefined();
});

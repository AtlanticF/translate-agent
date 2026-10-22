import { expect, test } from "vitest";
import { createSqliteSessionStore } from "./session-sqlite";

test("creates a session with timestamps and empty messages", async () => {
  const now = new Date("2026-10-22T00:00:00.000Z");
  const sessions = createSqliteSessionStore(() => now);
  const session = await sessions.create();

  expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(session.messages).toEqual([]);
  expect(session.copilotResponses).toEqual([]);
  expect(session.createdAt).toEqual(now);
  expect(session.updatedAt).toEqual(now);
  expect(await sessions.get(session.id)).toEqual(session);
});

test("lists sessions by most recently updated", async () => {
  let time = 0;
  const sessions = createSqliteSessionStore(() => new Date(time));
  const first = await sessions.create({ id: "first" });
  time = 10;
  const second = await sessions.create({ id: "second" });
  time = 20;
  await sessions.update(first.id, { messages: [{ role: "user", content: "later" }] });

  const listed = await sessions.list();

  expect(listed.map((session) => session.id)).toEqual(["first", "second"]);
  expect(listed[1]).toEqual(second);
});

test("updates messages without letting callers change the stored copy", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create();
  const message = { role: "user" as const, content: "hello" };

  const updated = await sessions.update(session.id, { messages: [message] });
  updated.messages.push({ role: "user", content: "extra" });

  expect((await sessions.get(session.id))?.messages).toEqual([message]);
  expect((await sessions.get(session.id))?.updatedAt.getTime()).toBeGreaterThanOrEqual(
    session.createdAt.getTime(),
  );
});

test("stores copilot responses on the session", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create();
  const response = { status: "approve" as const, tool: { callId: "call-1" } };

  await sessions.update(session.id, { copilotResponses: [response] });

  expect((await sessions.get(session.id))?.copilotResponses).toEqual([response]);
});

test("deletes a session", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create();

  await sessions.delete(session.id);

  expect(await sessions.get(session.id)).toBeUndefined();
});

test("throws when updating or deleting an unknown session", async () => {
  const sessions = createSqliteSessionStore();

  await expect(sessions.update("missing", { messages: [] })).rejects.toThrow(/unknown session: missing/);
  await expect(sessions.delete("missing")).rejects.toThrow(/unknown session: missing/);
  expect(await sessions.get("missing")).toBeUndefined();
});

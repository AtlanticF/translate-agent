import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, test } from "vitest";
import * as schema from "./session-schema";
import { createSessionStore } from "./session-store";
import { createSqliteSessionStore } from "./session-sqlite";

test("creates a session owned by the user with timestamps and empty messages", async () => {
  const now = new Date("2026-10-22T00:00:00.000Z");
  const sessions = createSqliteSessionStore(() => now);
  const session = await sessions.create("user-a");

  expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(session.userId).toBe("user-a");
  expect(session.title).toBeNull();
  expect(session.messages).toEqual([]);
  expect(session.copilotResponses).toEqual([]);
  expect(session.createdAt).toEqual(now);
  expect(session.updatedAt).toEqual(now);
  expect(await sessions.get("user-a", session.id)).toEqual(session);
  expect(await sessions.get("user-b", session.id)).toBeUndefined();
});

test("lists only the current user's sessions by most recently updated", async () => {
  let time = 0;
  const sessions = createSqliteSessionStore(() => new Date(time));
  const first = await sessions.create("user-a", { id: "first" });
  time = 10;
  const second = await sessions.create("user-b", { id: "second" });
  time = 20;
  await sessions.update("user-a", first.id, {
    messages: [{ role: "user", content: "later" }],
  });

  expect((await sessions.list("user-a")).map((session) => session.id)).toEqual(["first"]);
  expect((await sessions.list("user-b")).map((session) => session.id)).toEqual(["second"]);
  expect(await sessions.get("user-b", second.id)).toEqual(second);
});

test("updates messages without letting callers change the stored copy", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create("user-a");
  const message = { role: "user" as const, content: "hello" };

  const updated = await sessions.update("user-a", session.id, { messages: [message] });
  updated.messages.push({ role: "user", content: "extra" });

  expect((await sessions.get("user-a", session.id))?.messages).toEqual([message]);
  expect((await sessions.get("user-a", session.id))?.updatedAt.getTime()).toBeGreaterThanOrEqual(
    session.createdAt.getTime(),
  );
});

test("renames a session without dropping its messages", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create("user-a");
  const message = { role: "user" as const, content: "hello" };
  await sessions.update("user-a", session.id, { messages: [message] });

  const renamed = await sessions.update("user-a", session.id, { title: "  Notes  " });
  expect(renamed.title).toBe("Notes");
  expect(renamed.messages).toEqual([message]);

  await sessions.update("user-a", session.id, { messages: [{ role: "user", content: "later" }] });
  expect((await sessions.get("user-a", session.id))?.title).toBe("Notes");

  const cleared = await sessions.update("user-a", session.id, { title: "   " });
  expect(cleared.title).toBeNull();
  expect(cleared.messages).toEqual([{ role: "user", content: "later" }]);
});

test("stores copilot responses on the session", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create("user-a");
  const response = { status: "approve" as const, tool: { callId: "call-1" } };

  await sessions.update("user-a", session.id, { copilotResponses: [response] });

  expect((await sessions.get("user-a", session.id))?.copilotResponses).toEqual([response]);
});

test("deletes only the current user's session", async () => {
  const sessions = createSqliteSessionStore();
  const session = await sessions.create("user-a");

  await expect(sessions.delete("user-b", session.id)).rejects.toThrow(
    /unknown session: /,
  );
  expect(await sessions.get("user-a", session.id)).toBeDefined();

  await sessions.delete("user-a", session.id);
  expect(await sessions.get("user-a", session.id)).toBeUndefined();
});

test("throws when updating or deleting an unknown session", async () => {
  const sessions = createSqliteSessionStore();

  await expect(sessions.update("user-a", "missing", { messages: [] })).rejects.toThrow(
    /unknown session: missing/,
  );
  await expect(sessions.delete("user-a", "missing")).rejects.toThrow(
    /unknown session: missing/,
  );
  expect(await sessions.get("user-a", "missing")).toBeUndefined();
});

test("ensure creates a session once and never reuses another user's id", async () => {
  const sessions = createSqliteSessionStore();
  const created = await sessions.ensure("user-a", { id: "shared" });
  expect(created?.userId).toBe("user-a");

  const message = { role: "user" as const, content: "mine" };
  await sessions.update("user-a", "shared", { messages: [message] });

  const again = await sessions.ensure("user-a", { id: "shared" });
  expect(again?.messages).toEqual([message]);
  expect(await sessions.ensure("user-b", { id: "shared" })).toBeUndefined();
  expect((await sessions.get("user-a", "shared"))?.messages).toEqual([message]);
});

test("hides legacy sessions without an owner from every user", async () => {
  const sessions = openLegacyStore();

  expect(await sessions.list("user-a")).toEqual([]);
  expect(await sessions.get("user-a", "legacy")).toBeUndefined();
  expect(await sessions.ensure("user-a", { id: "legacy" })).toBeUndefined();
});

function openLegacyStore() {
  const sqlite = new Database(":memory:");
  for (const migration of [
    "0000_sessions.sql",
    "0001_session_files.sql",
    "0002_session_file_progress.sql",
    "0003_session_ownership.sql",
    "0004_session_title.sql",
  ]) {
    sqlite.exec(readFileSync(new URL(`../drizzle/${migration}`, import.meta.url), "utf8"));
  }
  sqlite
    .prepare(
      "insert into sessions (id, messages, copilot_responses, created_at, updated_at) values (?, ?, ?, ?, ?)",
    )
    .run("legacy", "[]", "[]", 0, 0);
  return createSessionStore(drizzle(sqlite, { schema }));
}

import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, test } from "vitest";
import { createUserMemoryStore } from "./memory-store";
import * as schema from "./session-schema";

function openDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0006_user_memories.sql", import.meta.url), "utf8"));
  return drizzle(sqlite, { schema });
}

test("starts empty and saves per user", async () => {
  const db = openDb();
  const alice = createUserMemoryStore(db, "alice");
  const bob = createUserMemoryStore(db, "bob");

  expect(await alice.load()).toEqual([]);
  await alice.save([{ index: 0, text: "Use 您.", tags: ["style"] }]);
  await alice.save([{ index: 0, text: "Keep names.", tags: ["terminology"] }]);

  expect(await alice.load()).toEqual([{ index: 0, text: "Keep names.", tags: ["terminology"] }]);
  expect(await bob.load()).toEqual([]);
});

test("seeds from the legacy file once, then ignores it", async () => {
  const db = openDb();
  let legacy = [{ index: 0, text: "Old.", tags: ["style"] }];
  const store = createUserMemoryStore(db, "alice", async () => legacy);

  expect(await store.load()).toEqual(legacy);
  legacy = [{ index: 0, text: "Changed.", tags: ["style"] }];
  expect(await store.load()).toEqual([{ index: 0, text: "Old.", tags: ["style"] }]);
});

test("does not re-seed after the user deletes everything", async () => {
  const db = openDb();
  const store = createUserMemoryStore(db, "alice", async () => [
    { index: 0, text: "Old.", tags: ["style"] },
  ]);

  expect(await store.remove(0)).toEqual([]);
  expect(await store.load()).toEqual([]);
});

test("a failing legacy read starts empty", async () => {
  const store = createUserMemoryStore(openDb(), "alice", async () => {
    throw new Error("no fs");
  });

  expect(await store.load()).toEqual([]);
});

test("removes one memory and renumbers the rest", async () => {
  const store = createUserMemoryStore(openDb(), "alice");
  await store.save([
    { index: 0, text: "A", tags: ["style"] },
    { index: 1, text: "B", tags: ["style"] },
    { index: 2, text: "C", tags: ["style"] },
  ]);

  const left = await store.remove(1);

  expect(left).toEqual([
    { index: 0, text: "A", tags: ["style"] },
    { index: 1, text: "C", tags: ["style"] },
  ]);
  expect(await store.load()).toEqual(left);
});

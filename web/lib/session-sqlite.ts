import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createSessionStore } from "./session-store";
import * as schema from "./session-schema";

export function createSqliteSessionStore(now?: () => Date) {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_sessions.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0001_session_files.sql", import.meta.url), "utf8"));
  return createSessionStore(drizzle(sqlite, { schema }), { now });
}

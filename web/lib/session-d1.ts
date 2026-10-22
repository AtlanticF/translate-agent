import { drizzle } from "drizzle-orm/d1";
import { createSessionStore } from "./session-store";
import * as schema from "./session-schema";

export function createD1SessionStore(database: D1Database): ReturnType<typeof createSessionStore> {
  return createSessionStore(drizzle(database, { schema }));
}

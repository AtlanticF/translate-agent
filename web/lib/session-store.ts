import { desc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { Session, SessionCreate, SessionPatch, SessionStore } from "./session";
import { sessions } from "./session-schema";

type SessionDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, { sessions: typeof sessions }>;

export function createSessionStore(
  db: SessionDatabase,
  options: { now?: () => Date } = {},
): SessionStore {
  const now = options.now ?? (() => new Date());

  return {
    async create(input: SessionCreate = {}) {
      const createdAt = now();
      const session: Session = {
        id: input.id ?? crypto.randomUUID(),
        messages: [...(input.messages ?? [])],
        copilotResponses: [...(input.copilotResponses ?? [])],
        createdAt,
        updatedAt: createdAt,
      };
      await db.insert(sessions).values(session);
      return copySession(session);
    },

    async list() {
      const rows = await db.select().from(sessions).orderBy(desc(sessions.updatedAt));
      return rows.map(copySession);
    },

    async get(id) {
      const row = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      return row ? copySession(row) : undefined;
    },

    async update(id, patch: SessionPatch) {
      const current = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      if (!current) {
        throw new Error(`unknown session: ${id}`);
      }
      const session: Session = {
        ...copySession(current),
        ...patch,
        messages: patch.messages ? [...patch.messages] : [...current.messages],
        copilotResponses: patch.copilotResponses
          ? [...patch.copilotResponses]
          : [...current.copilotResponses],
        updatedAt: now(),
      };
      await db.update(sessions).set(session).where(eq(sessions.id, id));
      return copySession(session);
    },

    async delete(id) {
      const current = await db.select().from(sessions).where(eq(sessions.id, id)).get();
      if (!current) {
        throw new Error(`unknown session: ${id}`);
      }
      await db.delete(sessions).where(eq(sessions.id, id));
    },
  };
}

function copySession(session: Session): Session {
  return {
    id: session.id,
    messages: [...session.messages],
    copilotResponses: [...session.copilotResponses],
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

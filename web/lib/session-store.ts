import { and, desc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import {
  SessionNotFoundError,
  type Session,
  type SessionCreate,
  type SessionPatch,
  type SessionStore,
} from "./session";
import { sessions } from "./session-schema";

type SessionDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, { sessions: typeof sessions }>;

export function createSessionStore(
  db: SessionDatabase,
  options: { now?: () => Date } = {},
): SessionStore {
  const now = options.now ?? (() => new Date());

  return {
    async create(userId, input: SessionCreate = {}) {
      const createdAt = now();
      const session: Session = {
        id: input.id ?? crypto.randomUUID(),
        userId,
        messages: [...(input.messages ?? [])],
        copilotResponses: [...(input.copilotResponses ?? [])],
        createdAt,
        updatedAt: createdAt,
      };
      await db.insert(sessions).values(session);
      return copySession(session);
    },

    async ensure(userId, input) {
      const createdAt = now();
      await db
        .insert(sessions)
        .values({
          id: input.id,
          userId,
          messages: [...(input.messages ?? [])],
          copilotResponses: [...(input.copilotResponses ?? [])],
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing();
      const row = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, input.id), eq(sessions.userId, userId)))
        .get();
      return row ? copySession(row) : undefined;
    },

    async list(userId) {
      const rows = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.updatedAt));
      return rows.map(copySession);
    },

    async get(userId, id) {
      const row = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
        .get();
      return row ? copySession(row) : undefined;
    },

    async update(userId, id, patch: SessionPatch) {
      const current = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
        .get();
      if (!current) {
        throw new SessionNotFoundError(id);
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
      await db
        .update(sessions)
        .set(session)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
      return copySession(session);
    },

    async delete(userId, id) {
      const current = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
        .get();
      if (!current) {
        throw new SessionNotFoundError(id);
      }
      await db
        .delete(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
    },
  };
}

function copySession(session: Session): Session {
  return {
    id: session.id,
    userId: session.userId,
    messages: [...session.messages],
    copilotResponses: [...session.copilotResponses],
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

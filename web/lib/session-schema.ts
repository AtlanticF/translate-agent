import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CopilotResponseEntry } from "../../src/messages/context";
import type { ContextMessage } from "./session";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  messages: text("messages", { mode: "json" }).$type<ContextMessage[]>().notNull(),
  copilotResponses: text("copilot_responses", { mode: "json" })
    .$type<CopilotResponseEntry[]>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessionFiles = sqliteTable("session_files", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

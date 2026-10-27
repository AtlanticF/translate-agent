import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CopilotResponseEntry } from "../../src/messages/context";
import type { ContextMessage } from "./session";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
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
  status: text("status").$type<"open" | "done">().notNull().default("open"),
  covered: text("covered", { mode: "json" }).$type<[number, number][]>().notNull().default([]),
  sourceChars: integer("source_chars").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

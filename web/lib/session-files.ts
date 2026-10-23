import { and, asc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { sessionFiles } from "./session-schema";

const maxFileBytes = 10 * 1024 * 1024;

export type ObjectBody = {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ObjectBucket = {
  get(key: string): Promise<ObjectBody | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

type FileDatabase = BaseSQLiteDatabase<
  "sync" | "async",
  unknown,
  { sessionFiles: typeof sessionFiles }
>;

export type SessionFile = {
  id: string;
  sessionId: string;
  name: string;
  mediaType: string;
  size: number;
  path: string;
  createdAt: Date;
};

export type SessionFileStore = {
  add(
    sessionId: string,
    file: { name: string; mediaType: string; bytes: Uint8Array },
  ): Promise<SessionFile>;
  list(sessionId: string): Promise<SessionFile[]>;
  get(sessionId: string, fileId: string): Promise<SessionFile | undefined>;
  readOriginalText(filePath: string): Promise<string>;
  appendTranslated(filePath: string, translated: string): Promise<void>;
  readTranslated(sessionId: string, fileId: string): Promise<string>;
  removeSession(sessionId: string): Promise<void>;
};

export function createSessionFileStore(
  db: FileDatabase,
  bucket: ObjectBucket,
  options: { now?: () => Date } = {},
): SessionFileStore {
  const now = options.now ?? (() => new Date());

  return {
    async add(sessionId, file) {
      if (file.bytes.byteLength > maxFileBytes) {
        throw new Error("file is larger than 10MB");
      }
      const id = crypto.randomUUID();
      const name = safeFileName(file.name);
      const mediaType = file.mediaType || "application/octet-stream";
      const createdAt = now();
      await db.insert(sessionFiles).values({
        id,
        sessionId,
        name,
        mediaType,
        size: file.bytes.byteLength,
        createdAt,
      });
      await bucket.put(originalKey(sessionId, id), file.bytes);
      await bucket.put(translatedKey(sessionId, id), "");
      return toFile({ id, sessionId, name, mediaType, size: file.bytes.byteLength, createdAt });
    },

    async list(sessionId) {
      const rows = await db
        .select()
        .from(sessionFiles)
        .where(eq(sessionFiles.sessionId, sessionId))
        .orderBy(asc(sessionFiles.createdAt));
      return rows.map(toFile);
    },

    async get(sessionId, fileId) {
      const row = await db
        .select()
        .from(sessionFiles)
        .where(and(eq(sessionFiles.sessionId, sessionId), eq(sessionFiles.id, fileId)))
        .get();
      return row ? toFile(row) : undefined;
    },

    async readOriginalText(filePath) {
      const parsed = parseImportedFilePath(filePath);
      if (!parsed) {
        throw new Error(`File not found: ${filePath}`);
      }
      const body = await bucket.get(originalKey(parsed.sessionId, parsed.fileId));
      if (!body) {
        throw new Error(`File not found: ${filePath}`);
      }
      return body.text();
    },

    async appendTranslated(filePath, translated) {
      const parsed = parseImportedFilePath(filePath);
      if (!parsed) {
        throw new Error(`File not found: ${filePath}`);
      }
      const row = await db
        .select()
        .from(sessionFiles)
        .where(and(eq(sessionFiles.sessionId, parsed.sessionId), eq(sessionFiles.id, parsed.fileId)))
        .get();
      if (!row) {
        throw new Error(`File not found: ${filePath}`);
      }
      const key = translatedKey(parsed.sessionId, parsed.fileId);
      const current = await bucket.get(key);
      const text = current ? await current.text() : "";
      await bucket.put(key, text.length === 0 ? translated : `${text}\n\n${translated}`);
    },

    async readTranslated(sessionId, fileId) {
      const body = await bucket.get(translatedKey(sessionId, fileId));
      return body ? body.text() : "";
    },

    async removeSession(sessionId) {
      const rows = await db
        .select()
        .from(sessionFiles)
        .where(eq(sessionFiles.sessionId, sessionId));
      for (const row of rows) {
        await bucket.delete(originalKey(sessionId, row.id));
        await bucket.delete(translatedKey(sessionId, row.id));
      }
      await db.delete(sessionFiles).where(eq(sessionFiles.sessionId, sessionId));
    },
  };
}

export function importedFilePath(sessionId: string, fileId: string, name: string): string {
  return `/sessions/${sessionId}/files/${fileId}/${safeFileName(name)}`;
}

export function parseImportedFilePath(
  filePath: string,
): { sessionId: string; fileId: string } | undefined {
  const match = /^\/sessions\/([^/]+)\/files\/([^/]+)\/[^/]+$/.exec(filePath);
  if (!match) {
    return undefined;
  }
  return { sessionId: match[1], fileId: match[2] };
}

export function translatedDownloadName(name: string): string {
  return `${safeFileName(name).replace(/["\\]/g, "_")}.translated.txt`;
}

export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).filter(Boolean).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").slice(0, 180);
  return cleaned.length > 0 ? cleaned : "file";
}

function originalKey(sessionId: string, fileId: string): string {
  return `sessions/${sessionId}/${fileId}/original`;
}

function translatedKey(sessionId: string, fileId: string): string {
  return `sessions/${sessionId}/${fileId}/translated`;
}

function toFile(row: {
  id: string;
  sessionId: string;
  name: string;
  mediaType: string;
  size: number;
  createdAt: Date;
}): SessionFile {
  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    mediaType: row.mediaType,
    size: row.size,
    path: importedFilePath(row.sessionId, row.id, row.name),
    createdAt: row.createdAt,
  };
}

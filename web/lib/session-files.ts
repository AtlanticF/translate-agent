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

export type SessionFileStatus = "open" | "done";

export type SourceSpan = {
  start: number;
  end: number;
};

export type SessionFile = {
  id: string;
  sessionId: string;
  name: string;
  mediaType: string;
  size: number;
  path: string;
  status: SessionFileStatus;
  progress: number;
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
  appendTranslated(filePath: string, translated: string, source?: SourceSpan): Promise<void>;
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
      const text = new TextDecoder().decode(file.bytes);
      const status: SessionFileStatus = text.trim().length === 0 ? "done" : "open";
      await db.insert(sessionFiles).values({
        id,
        sessionId,
        name,
        mediaType,
        size: file.bytes.byteLength,
        status,
        covered: [],
        sourceChars: text.length,
        createdAt,
      });
      await bucket.put(originalKey(sessionId, id), file.bytes);
      await bucket.put(translatedKey(sessionId, id), "");
      return toFile({
        id,
        sessionId,
        name,
        mediaType,
        size: file.bytes.byteLength,
        status,
        covered: [],
        sourceChars: text.length,
        createdAt,
      });
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

    async appendTranslated(filePath, translated, source) {
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
      if (!source || source.end <= source.start) {
        return;
      }
      const covered = mergeRanges([...(row.covered ?? []), [source.start, source.end]]);
      const original = await bucket.get(originalKey(parsed.sessionId, parsed.fileId));
      const sourceText = original ? await original.text() : "";
      const done = row.status === "done" || translationCovers(sourceText, covered);
      await db
        .update(sessionFiles)
        .set({
          covered,
          sourceChars: sourceText.length,
          status: done ? "done" : "open",
        })
        .where(and(eq(sessionFiles.sessionId, parsed.sessionId), eq(sessionFiles.id, parsed.fileId)));
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

export function mergeRanges(ranges: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = ranges
    .filter(([start, end]) => end > start)
    .map(([start, end]): [number, number] => [start, end])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1]) {
      merged.push([start, end]);
      continue;
    }
    if (end > last[1]) {
      last[1] = end;
    }
  }
  return merged;
}

export function translationCovers(
  text: string,
  ranges: readonly (readonly [number, number])[],
): boolean {
  if (text.trim().length === 0) {
    return true;
  }
  let cursor = 0;
  for (const [start, end] of mergeRanges(ranges)) {
    if (text.slice(cursor, start).trim().length > 0) {
      return false;
    }
    cursor = Math.max(cursor, end);
  }
  return text.slice(cursor).trim().length === 0;
}

export function translationProgress(
  sourceChars: number,
  ranges: readonly (readonly [number, number])[],
  status: SessionFileStatus,
): number {
  if (status === "done") {
    return 1;
  }
  if (sourceChars <= 0) {
    return 0;
  }
  const covered = mergeRanges(ranges).reduce((sum, [start, end]) => {
    const from = Math.max(0, Math.min(start, sourceChars));
    const to = Math.max(0, Math.min(end, sourceChars));
    return sum + (to - from);
  }, 0);
  return Math.min(1, covered / sourceChars);
}

function toFile(row: {
  id: string;
  sessionId: string;
  name: string;
  mediaType: string;
  size: number;
  status: SessionFileStatus;
  covered: [number, number][];
  sourceChars: number;
  createdAt: Date;
}): SessionFile {
  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    mediaType: row.mediaType,
    size: row.size,
    path: importedFilePath(row.sessionId, row.id, row.name),
    status: row.status,
    progress: translationProgress(row.sourceChars, row.covered ?? [], row.status),
    createdAt: row.createdAt,
  };
}

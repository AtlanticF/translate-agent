import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, test } from "vitest";
import { saveUploadedFiles } from "./save-session-files";
import { createSessionStore } from "./session-store";
import {
  createSessionFileStore,
  type ObjectBucket,
  translatedDownloadName,
} from "./session-files";
import * as schema from "./session-schema";

test("stores an original copy and appends only approved translations", async () => {
  const { sessions, files, bucket } = openStore();
  const session = await sessions.create({ id: "session-1" });

  const saved = await files.add(session.id, {
    name: "notes/readme.md",
    mediaType: "text/markdown",
    bytes: new TextEncoder().encode("hello world"),
  });

  expect(saved.name).toBe("readme.md");
  expect(saved.path).toBe(`/sessions/${session.id}/files/${saved.id}/readme.md`);
  expect(await files.readOriginalText(saved.path)).toBe("hello world");
  expect(await files.readTranslated(session.id, saved.id)).toBe("");

  await files.appendTranslated(saved.path, "你好");
  await files.appendTranslated(saved.path, "世界");

  expect(await files.readOriginalText(saved.path)).toBe("hello world");
  expect(await files.readTranslated(session.id, saved.id)).toBe("你好\n\n世界");
  expect(bucket.objects.has(`sessions/${session.id}/${saved.id}/original`)).toBe(true);
});

test("lists files for one session and removes them with the session", async () => {
  const { sessions, files, bucket } = openStore();
  const first = await sessions.create({ id: "first" });
  const second = await sessions.create({ id: "second" });
  await files.add(first.id, { name: "a.txt", mediaType: "text/plain", bytes: new Uint8Array([1]) });
  await files.add(second.id, { name: "b.txt", mediaType: "text/plain", bytes: new Uint8Array([2]) });

  expect((await files.list(first.id)).map((file) => file.name)).toEqual(["a.txt"]);

  await files.removeSession(first.id);

  expect(await files.list(first.id)).toEqual([]);
  expect(bucket.objects.size).toBe(2);
  expect((await files.list(second.id)).map((file) => file.name)).toEqual(["b.txt"]);
});

test("rejects a file larger than 10MB", async () => {
  const { files } = openStore();

  await expect(
    files.add("session-1", {
      name: "big.bin",
      mediaType: "application/octet-stream",
      bytes: new Uint8Array(10 * 1024 * 1024 + 1),
    }),
  ).rejects.toThrow(/10MB/);
});

test("creates a session when the first file is uploaded", async () => {
  const { sessions, files } = openStore();

  const saved = await saveUploadedFiles(sessions, files, "new-session", [
    { name: "a.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("alpha") },
    { name: "b.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("beta") },
  ]);

  expect(saved.sessionId).toBe("new-session");
  expect(saved.files.map((file) => file.name)).toEqual(["a.txt", "b.txt"]);
  expect(await sessions.get("new-session")).toBeDefined();
});

test("names the download after the original file", () => {
  expect(translatedDownloadName('notes/"readme".md')).toBe("_readme_.md.translated.txt");
});

function openStore() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_sessions.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0001_session_files.sql", import.meta.url), "utf8"));
  const db = drizzle(sqlite, { schema });
  const bucket = memoryBucket();
  return {
    sessions: createSessionStore(db),
    files: createSessionFileStore(db, bucket),
    bucket,
  };
}

function memoryBucket(): ObjectBucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async get(key) {
      const value = objects.get(key);
      if (!value) {
        return null;
      }
      const bytes = value;
      return {
        async text() {
          return new TextDecoder().decode(bytes);
        },
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        },
      };
    },
    async put(key, value) {
      const bytes =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value instanceof Uint8Array
            ? new Uint8Array(value)
            : new Uint8Array(value);
      objects.set(key, bytes);
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

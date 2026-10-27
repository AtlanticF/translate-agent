import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, test } from "vitest";
import { saveUploadedFiles } from "./save-session-files";
import { createSessionStore } from "./session-store";
import {
  createSessionFileStore,
  ownedAppendTranslated,
  ownedReadOriginalText,
  type ObjectBucket,
  translatedDownloadName,
} from "./session-files";
import * as schema from "./session-schema";

test("stores an original copy and appends only approved translations", async () => {
  const { sessions, files, bucket } = openStore();
  const session = await sessions.create("user-a", { id: "session-1" });

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

test("marks a file done when approved spans cover the source", async () => {
  const { files } = openStore();
  const source = "hello\n\nworld";
  const saved = await files.add("session-1", {
    name: "a.txt",
    mediaType: "text/plain",
    bytes: new TextEncoder().encode(source),
  });

  expect(saved.status).toBe("open");
  expect(saved.progress).toBe(0);

  await files.appendTranslated(saved.path, "你好", { start: 0, end: 5 });
  const partial = (await files.list("session-1"))[0];
  expect(partial?.status).toBe("open");
  expect(partial?.progress).toBeCloseTo(5 / source.length);

  await files.appendTranslated(saved.path, "世界", { start: 7, end: source.length });
  const done = (await files.list("session-1"))[0];
  expect(done?.status).toBe("done");
  expect(done?.progress).toBe(1);
  expect(await files.readOriginalText(saved.path)).toBe(source);
  expect(await files.readTranslated("session-1", saved.id)).toBe("你好\n\n世界");
});

test("keeps a file open when a paragraph is still untranslated", async () => {
  const { files } = openStore();
  const saved = await files.add("session-1", {
    name: "a.txt",
    mediaType: "text/plain",
    bytes: new TextEncoder().encode("hello\n\nworld"),
  });

  await files.appendTranslated(saved.path, "世界", { start: 7, end: 12 });

  expect((await files.list("session-1"))[0]).toMatchObject({ status: "open" });
});

test("lists files for one session and removes them with the session", async () => {
  const { sessions, files, bucket } = openStore();
  const first = await sessions.create("user-a", { id: "first" });
  const second = await sessions.create("user-a", { id: "second" });
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

  const saved = await saveUploadedFiles(sessions, files, "user-a", "new-session", [
    { name: "a.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("alpha") },
    { name: "b.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("beta") },
  ]);

  expect(saved.sessionId).toBe("new-session");
  expect(saved.files.map((file) => file.name)).toEqual(["a.txt", "b.txt"]);
  expect(await sessions.get("user-a", "new-session")).toBeDefined();
  expect(await sessions.get("user-b", "new-session")).toBeUndefined();
});

test("rejects uploads to another user's session", async () => {
  const { sessions, files } = openStore();
  await sessions.create("user-b", { id: "taken" });

  await expect(
    saveUploadedFiles(sessions, files, "user-a", "taken", [
      { name: "a.txt", mediaType: "text/plain", bytes: new TextEncoder().encode("alpha") },
    ]),
  ).rejects.toThrow(/unknown session: taken/);

  expect(await files.list("taken")).toEqual([]);
  expect((await sessions.get("user-b", "taken"))?.messages).toEqual([]);
});

test("owned file access rejects another user's session", async () => {
  const { sessions, files } = openStore();
  await sessions.create("user-b", { id: "session-b" });
  const saved = await files.add("session-b", {
    name: "a.txt",
    mediaType: "text/plain",
    bytes: new TextEncoder().encode("hello"),
  });
  const read = ownedReadOriginalText(sessions, files, "user-a");
  const append = ownedAppendTranslated(sessions, files, "user-a");

  await expect(read(saved.path)).rejects.toThrow(`File not found: ${saved.path}`);
  await expect(append(saved.path, "你好")).rejects.toThrow(`File not found: ${saved.path}`);
  expect(await files.readTranslated("session-b", saved.id)).toBe("");
});

test("owned file access works for the session owner", async () => {
  const { sessions, files } = openStore();
  await sessions.create("user-a", { id: "session-a" });
  const saved = await files.add("session-a", {
    name: "a.txt",
    mediaType: "text/plain",
    bytes: new TextEncoder().encode("hello"),
  });
  const read = ownedReadOriginalText(sessions, files, "user-a");
  const append = ownedAppendTranslated(sessions, files, "user-a");

  expect(await read(saved.path)).toBe("hello");
  await append(saved.path, "你好");
  expect(await files.readTranslated("session-a", saved.id)).toBe("你好");
});

test("names the download after the original file", () => {
  expect(translatedDownloadName('notes/"readme".md')).toBe("_readme_.md.translated.txt");
});

function openStore() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_sessions.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0001_session_files.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0002_session_file_progress.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0003_session_ownership.sql", import.meta.url), "utf8"));
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

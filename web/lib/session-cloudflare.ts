import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { createSessionFileStore, type ObjectBucket, type SessionFileStore } from "./session-files";
import { createSessionStore } from "./session-store";
import * as schema from "./session-schema";
import type { SessionStore } from "./session";

export async function getSessionStore(): Promise<SessionStore> {
  const { sessions, files } = await openStores();
  return {
    ...sessions,
    async delete(id) {
      await files.removeSession(id);
      await sessions.delete(id);
    },
  };
}

export async function getSessionFileStore(): Promise<SessionFileStore> {
  const { files } = await openStores();
  return files;
}

function kvFiles(namespace: KVNamespace): ObjectBucket {
  return {
    async get(key) {
      const bytes = await namespace.get(key, "arrayBuffer");
      if (bytes === null) {
        return null;
      }
      return {
        text: () => Promise.resolve(new TextDecoder().decode(bytes)),
        arrayBuffer: () => Promise.resolve(bytes),
      };
    },
    put(key, value) {
      return namespace.put(key, value);
    },
    delete(key) {
      return namespace.delete(key);
    },
  };
}

async function openStores(): Promise<{ sessions: SessionStore; files: SessionFileStore }> {
  const { env } = await getCloudflareContext({ async: true });
  const db = drizzle(env.DB, { schema });
  return {
    sessions: createSessionStore(db),
    files: createSessionFileStore(db, kvFiles(env.FILES)),
  };
}

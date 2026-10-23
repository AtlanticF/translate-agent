import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelMessage } from "ai";
import { loadEnvFile } from "../../../src/env";
import { postNext, type NextTurnRequest } from "../../lib/next-turn";
import { getSessionFileStore, getSessionStore } from "../../lib/session-cloudflare";
import type { SessionFileStore } from "../../lib/session-files";

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");

export async function POST(request: Request) {
  loadEnvFile(envPath);
  const body = (await request.json()) as NextTurnRequest;
  const files = await getSessionFileStore();
  const result = await postNext(
    body,
    request.signal,
    await getSessionStore(),
    (messages) => openLoop(messages, files),
    files,
  );
  return Response.json(result.body, { status: result.status });
}

async function openLoop(messages: readonly ModelMessage[], files: SessionFileStore) {
  const session = await import("../../lib/agent-session.js");
  return session.createLoop(messages, {
    read: (filePath) => files.readOriginalText(filePath),
    write: async ({ file_path, translated_string }) => {
      await files.appendTranslated(file_path, translated_string);
    },
  });
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelMessage } from "ai";
import { loadEnvFile } from "../../../src/env";
import { readLocalDir } from "../../../src/tools/ls-tool";
import { postNext, type NextTurnRequest } from "../../lib/next-turn";
import { requireUserId } from "../../lib/request-auth";
import type { SessionStore } from "../../lib/session";
import { getSessionFileStore, getSessionStore } from "../../lib/session-cloudflare";
import {
  ownedAppendTranslated,
  ownedReadOriginalText,
  type SessionFileStore,
} from "../../lib/session-files";
import { isSkillsPath, loadWebSkills, type LoadedSkills } from "../../lib/skills";
import { skillsBundle } from "../../lib/skills-bundle";

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");

let skillsPromise: Promise<LoadedSkills> | undefined;

export async function POST(request: Request) {
  loadEnvFile(envPath);
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const body = (await request.json()) as NextTurnRequest;
  const sessions = await getSessionStore();
  const files = await getSessionFileStore();
  const skills = await loadSkills();
  const result = await postNext(
    auth.userId,
    body,
    request.signal,
    sessions,
    (messages, sessionId) =>
      openLoop(messages, { sessions, files, userId: auth.userId, sessionId, skills }),
    files,
  );
  return Response.json(result.body, { status: result.status });
}

function loadSkills(): Promise<LoadedSkills> {
  skillsPromise ??= loadWebSkills(skillsBundle);
  return skillsPromise;
}

async function openLoop(
  messages: readonly ModelMessage[],
  context: {
    sessions: SessionStore;
    files: SessionFileStore;
    userId: string;
    sessionId: string;
    skills: LoadedSkills;
  },
) {
  const session = await import("../../lib/agent-session.js");
  const readImported = ownedReadOriginalText(context.sessions, context.files, context.userId);
  const appendTranslated = ownedAppendTranslated(context.sessions, context.files, context.userId);
  return session.createLoop(
    messages,
    {
      read: (filePath) =>
        isSkillsPath(filePath)
          ? context.skills.fs.readFile(filePath)
          : readImported(filePath),
      write: async ({ file_path, translated_string, source_start, source_end }) => {
        await appendTranslated(file_path, translated_string, {
          start: source_start,
          end: source_end,
        });
      },
      writeFile: async ({ file_path, content }) => {
        const saved = await context.files.add(context.sessionId, {
          name: path.basename(file_path) || "article.md",
          mediaType: "text/markdown",
          bytes: new TextEncoder().encode(content),
        });
        return { file_path: saved.path };
      },
      ls: (dirPath) =>
        isSkillsPath(dirPath)
          ? context.skills.fs.readDir(dirPath)
          : readLocalDir(dirPath),
    },
    { skillsPrompt: context.skills.prompt },
  );
}

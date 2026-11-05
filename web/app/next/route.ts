import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelMessage } from "ai";
import { loadEnvFile } from "../../../src/env";
import { readLocalDir } from "../../../src/tools/ls-tool";
import type { WebFileIO } from "../../../src/tools/web-io";
import { postNext, type NextTurnEventHandler, type NextTurnRequest } from "../../lib/next-turn";
import { requireUserId } from "../../lib/request-auth";
import type { SessionStore } from "../../lib/session";
import { getSessionFileStore, getSessionStore } from "../../lib/session-cloudflare";
import {
  ownedAppendTranslated,
  ownedReadOriginalText,
  type SessionFileStore,
} from "../../lib/session-files";
import type { TranslateCovered } from "../../../src/tools/translate-tool";
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
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let cancelled = false;
  const forwardAbort = () => {
    cancelled = true;
    abort.abort(request.signal.reason);
  };
  request.signal.addEventListener("abort", forwardAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: NextTurnEventHandler = (event) => {
        if (!cancelled) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
        }
      };
      try {
        await postNext(
          auth.userId,
          body,
          abort.signal,
          sessions,
          (messages, sessionId) =>
            openLoop(messages, { sessions, files, userId: auth.userId, sessionId, skills }),
          files,
          emit,
        );
      } catch (error) {
        console.error("next stream failed:", error);
        if (!abort.signal.aborted) {
          emit({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        request.signal.removeEventListener("abort", forwardAbort);
        if (!cancelled) {
          controller.close();
        }
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
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
  // 已翻译的源文覆盖区间，供 Translate 识别重复段落（续翻防重复）。
  const coveredSpans: TranslateCovered = async (filePath) => {
    const spans = await context.files.translatedSpans(filePath);
    return spans ?? [];
  };
  // Web 工具链的中间产物（raw/clean HTML、markdown）都存在 session file store，
  // 模型只拿 file_path，避免在 tool call 参数里回显大段 HTML。
  const webFiles: WebFileIO = {
    read: readImported,
    save: async ({ name, mediaType, content }) => {
      const saved = await context.files.add(context.sessionId, {
        name: path.basename(name) || "article.html",
        mediaType,
        bytes: new TextEncoder().encode(content),
      });
      return { file_path: saved.path };
    },
  };
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
      covered: coveredSpans,
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
      webFiles,
    },
    { skillsPrompt: context.skills.prompt },
  );
}

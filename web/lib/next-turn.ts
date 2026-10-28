import { APICallError, RetryError, type ModelMessage, type UserModelMessage } from "ai";
import type { AgentLoopNext } from "../../src/agent/agent-loop";
import type { CopilotResponseEntry } from "../../src/messages/context";
import { withTrace } from "../../src/observability/langfuse";
import { omitDoneFilePaths, withImportedFiles } from "./imported-files";
import type { SessionFileStatus } from "./session-files";
import type { SessionStore } from "./session";

export type NextTurnRequest = {
  sessionId?: string;
  userInput?: string;
  copilotResponses?: CopilotResponseEntry[];
};

export type TurnFile = {
  id: string;
  name: string;
  path: string;
  status: SessionFileStatus;
  progress: number;
};

export type NextTurnResponse = {
  status: number;
  body:
    | { sessionId: string; agentResponse: AgentLoopNext; files: TurnFile[] }
    | { error: string };
};

type TurnAgent = {
  userInput(messages: UserModelMessage[]): Promise<void>;
  addCopilotResponses(responses: readonly CopilotResponseEntry[]): void;
  next(signal?: AbortSignal): Promise<AgentLoopNext>;
};

export type ImportedFileList = {
  list(sessionId: string): Promise<Array<{ path: string; status?: SessionFileStatus } & Partial<TurnFile>>>;
};

export async function postNext(
  userId: string,
  request: NextTurnRequest,
  signal: AbortSignal | undefined,
  sessions: SessionStore,
  openAgent: (messages: readonly ModelMessage[], sessionId: string) => Promise<TurnAgent> = openLoop,
  files?: ImportedFileList,
): Promise<NextTurnResponse> {
  let session = request.sessionId
    ? await sessions.get(userId, request.sessionId)
    : await sessions.create(userId);
  if (!session) {
    return { status: 404, body: { error: "session not found" } };
  }

  const imported = files ? await files.list(session.id) : [];
  const donePaths = imported.filter((file) => file.status === "done").map((file) => file.path);
  const agent = await openAgent(omitDoneFilePaths(session.messages, donePaths), session.id);
  const userInput = request.userInput?.trim();
  if (userInput) {
    const pending = imported.filter((file) => file.status !== "done").map((file) => file.path);
    const messages: UserModelMessage[] = [{ role: "user", content: withImportedFiles(userInput, pending) }];
    session = await sessions.update(userId, session.id, {
      messages: [...session.messages, ...messages],
    });
    await agent.userInput(messages);
  }

  const pendingResponses = request.copilotResponses ?? [];
  if (pendingResponses.length > 0) {
    session = await sessions.update(userId, session.id, {
      copilotResponses: [...session.copilotResponses, ...pendingResponses],
    });
    agent.addCopilotResponses(pendingResponses);
  }

  let step: AgentLoopNext;
  try {
    step = await withTrace("web", session.id, () => agent.next(signal));
  } catch (error) {
    const detail = describeModelError(error);
    console.error("next turn failed:", detail);
    return { status: 502, body: { error: detail } };
  }
  const after = files ? await files.list(session.id) : [];
  const stored =
    step.messages.length > 0 ? [...session.messages, ...step.messages] : session.messages;
  const cleaned = omitDoneFilePaths(
    stored,
    after.filter((file) => file.status === "done").map((file) => file.path),
  );
  if (cleaned !== session.messages) {
    await sessions.update(userId, session.id, { messages: [...cleaned] });
  }
  return {
    status: 200,
    body: { sessionId: session.id, agentResponse: step, files: fileList(after) },
  };
}

export function describeModelError(error: unknown): string {
  const api = findApiCallError(error);
  if (!api) {
    return error instanceof Error ? error.message : String(error);
  }
  const status = api.statusCode ? ` (HTTP ${api.statusCode})` : "";
  const detail = api.responseBody?.replace(/\s+/g, " ").trim().slice(0, 500) || api.message;
  return `model request failed${status}: ${detail}`;
}

function findApiCallError(error: unknown): APICallError | undefined {
  if (APICallError.isInstance(error)) {
    return error;
  }
  if (RetryError.isInstance(error) && APICallError.isInstance(error.lastError)) {
    return error.lastError;
  }
  return undefined;
}

function fileList(
  files: ReadonlyArray<{ path: string; status?: SessionFileStatus } & Partial<TurnFile>>,
): TurnFile[] {
  const listed: TurnFile[] = [];
  for (const file of files) {
    if (!file.id || !file.name) {
      continue;
    }
    const status = file.status === "done" ? "done" : "open";
    listed.push({
      id: file.id,
      name: file.name,
      path: file.path,
      status,
      progress: status === "done" ? 1 : (file.progress ?? 0),
    });
  }
  return listed;
}

async function openLoop(messages: readonly ModelMessage[]): Promise<TurnAgent> {
  const session = await import("./agent-session.js");
  return session.createLoop(messages);
}

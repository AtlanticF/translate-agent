import { APICallError, RetryError, type ModelMessage, type UserModelMessage } from "ai";
import type { AgentLoopEvent, AgentLoopEventHandler, AgentLoopNext } from "../../src/agent/agent-loop";
import type { CopilotResponseEntry } from "../../src/messages/context";
import { settleInterruptedToolCalls } from "../../src/messages/repair";
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

export type NextTurnSuccess = {
  sessionId: string;
  agentResponse: AgentLoopNext;
  files: TurnFile[];
};

export type NextTurnResponse = {
  status: number;
  body: NextTurnSuccess | { error: string };
};

export type NextTurnEvent =
  | { type: "start"; sessionId: string }
  | AgentLoopEvent
  | { type: "done"; turn: NextTurnSuccess }
  | { type: "error"; message: string };

export type NextTurnEventHandler = (event: NextTurnEvent) => void;

type TurnAgent = {
  userInput(messages: UserModelMessage[]): Promise<ModelMessage[]>;
  addCopilotResponses(responses: readonly CopilotResponseEntry[]): void;
  next(signal?: AbortSignal, emit?: AgentLoopEventHandler): Promise<AgentLoopNext>;
};

export type ImportedFileList = {
  list(sessionId: string): Promise<Array<{ path: string; status?: SessionFileStatus } & Partial<TurnFile>>>;
  resumeInfo?(filePath: string): Promise<{ line: number; excerpt: string } | undefined>;
};

export async function postNext(
  userId: string,
  request: NextTurnRequest,
  signal: AbortSignal | undefined,
  sessions: SessionStore,
  openAgent: (messages: readonly ModelMessage[], sessionId: string) => Promise<TurnAgent> = openLoop,
  files?: ImportedFileList,
  emit: NextTurnEventHandler = () => {},
): Promise<NextTurnResponse> {
  let session = request.sessionId
    ? await sessions.get(userId, request.sessionId)
    : await sessions.create(userId);
  if (!session) {
    emit({ type: "error", message: "session not found" });
    return { status: 404, body: { error: "session not found" } };
  }
  emit({ type: "start", sessionId: session.id });

  const imported = files ? await files.list(session.id) : [];
  const donePaths = imported.filter((file) => file.status === "done").map((file) => file.path);
  // 修复历史里 tool-call 与 tool-result 被 user 消息隔开的协议违规（中断恢复产生）。
  const restored = settleInterruptedToolCalls(omitDoneFilePaths(session.messages, donePaths));
  if (restored !== session.messages) {
    session = await sessions.update(userId, session.id, { messages: [...restored] });
  }
  const agent = await openAgent(restored, session.id);

  // 审核响应先于新输入处理，避免同一请求里既带审核又放弃旧调用。
  const pendingResponses = request.copilotResponses ?? [];
  if (pendingResponses.length > 0) {
    session = await sessions.update(userId, session.id, {
      copilotResponses: [...session.copilotResponses, ...pendingResponses],
    });
    agent.addCopilotResponses(pendingResponses);
  }

  const userInput = request.userInput?.trim();
  if (userInput) {
    const pending = imported.filter((file) => file.status !== "done").map((file) => file.path);
    // 续翻提示：告知模型第一个未翻译单元的位置，避免从头重复翻译。
    let partial: { line: number; excerpt: string } | undefined;
    const resume = files?.resumeInfo?.bind(files);
    if (resume && pending.length > 0) {
      for (const path of pending) {
        const info = await resume(path);
        if (info) {
          partial = info;
          break;
        }
      }
    }
    const messages: UserModelMessage[] = [
      { role: "user", content: withImportedFiles(userInput, pending, partial) },
    ];
    // userInput 先结算悬空的 tool call，产生的消息必须先于用户消息落库，保持协议顺序。
    const settled = await agent.userInput(messages);
    session = await sessions.update(userId, session.id, {
      messages: [...session.messages, ...settled, ...messages],
    });
  }

  let step: AgentLoopNext;
  try {
    step = await withTrace("web", session.id, () => agent.next(signal, emit));
  } catch (error) {
    const detail = describeModelError(error);
    console.error("next turn failed:", detail);
    emit({ type: "error", message: detail });
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
  const body = { sessionId: session.id, agentResponse: step, files: fileList(after) };
  emit({ type: "done", turn: body });
  return {
    status: 200,
    body,
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

// text/html 是 URL 翻译流程的服务端中间产物，不进 UI 文件列表。
// /next 的 fileList 和会话 GET 路由都要用它过滤。
export function isClientVisibleFile(file: { mediaType?: string }): boolean {
  return file.mediaType !== "text/html";
}

function fileList(
  files: ReadonlyArray<
    { path: string; status?: SessionFileStatus; mediaType?: string } & Partial<TurnFile>
  >,
): TurnFile[] {
  const listed: TurnFile[] = [];
  for (const file of files) {
    if (!file.id || !file.name) {
      continue;
    }
    if (!isClientVisibleFile(file)) {
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

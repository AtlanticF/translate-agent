import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ModelMessage, UserModelMessage } from "ai";
import { tsImport } from "tsx/esm/api";
import type { AgentLoopNext, CopilotHandler } from "../../src/agent/agent-loop";
import type { CopilotResponseEntry } from "../../src/messages/context";
import type { CopilotRequest, CopilotResponse } from "../../src/prompts/system.memory";
import { sessionManager as defaultSessions, type Session } from "./session-manager";

const sessionModule = pathToFileURL(
  path.resolve(process.cwd(), "../src/application/session.ts"),
).href;

export type NextTurnRequest = {
  sessionId?: string;
  userInput?: string;
  copilotResponses?: CopilotResponseEntry[];
};

export type NextTurnResponse = {
  status: number;
  body:
    | { sessionId: string; agentResponse: AgentLoopNext }
    | { error: string };
};

type Sessions = {
  createSession(): Session;
  getSession(id: string): Session | undefined;
  addMessages(id: string, messages: readonly ModelMessage[]): Session;
  addCopilotResponses(id: string, responses: readonly CopilotResponseEntry[]): Session;
};

type TurnAgent = {
  userInput(messages: UserModelMessage[]): Promise<void>;
  addCopilotResponses(responses: readonly CopilotResponseEntry[]): void;
  setCopilotHandler(handler: CopilotHandler): void;
  next(signal?: AbortSignal): Promise<AgentLoopNext>;
  getMessages(): Promise<ModelMessage[]>;
};

export async function postNext(
  request: NextTurnRequest,
  signal?: AbortSignal,
  sessions: Sessions = defaultSessions,
  openAgent: (messages: readonly ModelMessage[]) => Promise<TurnAgent> = openLoop,
): Promise<NextTurnResponse> {
  const session = request.sessionId
    ? sessions.getSession(request.sessionId)
    : sessions.createSession();
  if (!session) {
    return { status: 404, body: { error: "session not found" } };
  }

  const agent = await openAgent(session.messages);
  const userInput = request.userInput?.trim();
  if (userInput) {
    const messages: UserModelMessage[] = [{ role: "user", content: userInput }];
    sessions.addMessages(session.id, messages);
    await agent.userInput(messages);
  }

  const pendingResponses = request.copilotResponses ?? [];
  if (pendingResponses.length > 0) {
    sessions.addCopilotResponses(session.id, pendingResponses);
    agent.addCopilotResponses(pendingResponses);
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop);

  const copilot = Promise.withResolvers<{ kind: "copilot"; request: CopilotRequest }>();
  agent.setCopilotHandler(async (copilotRequest) => {
    const matched = pendingResponses.find(
      (response) => response.tool.callId === copilotRequest.tool.callId,
    );
    if (matched) {
      return matched;
    }
    copilot.resolve({ kind: "copilot", request: copilotRequest });
    return waitUntilAbort(controller.signal);
  });

  const nextTurn = runUntilUser(agent, controller.signal);
  const winner = await Promise.race([nextTurn, copilot.promise]);
  signal?.removeEventListener("abort", stop);

  if (winner.kind === "copilot") {
    controller.abort();
    const stored = sessions.getSession(session.id);
    const extra = (await agent.getMessages()).slice(stored?.messages.length ?? 0);
    if (extra.length > 0) {
      sessions.addMessages(session.id, extra);
    }
    return {
      status: 200,
      body: {
        sessionId: session.id,
        agentResponse: {
          messages: extra,
          nextActor: "agent",
          copilotRequests: [winner.request],
          unprocessedToolCalls: [],
        },
      },
    };
  }

  if (winner.agentResponse.messages.length > 0) {
    sessions.addMessages(session.id, winner.agentResponse.messages);
  }
  return {
    status: 200,
    body: { sessionId: session.id, agentResponse: winner.agentResponse },
  };
}

async function openLoop(messages: readonly ModelMessage[]): Promise<TurnAgent> {
  const session = (await tsImport(sessionModule, import.meta.url)) as {
    createLoop(messages: readonly ModelMessage[]): Promise<TurnAgent>;
  };
  return session.createLoop(messages);
}

async function runUntilUser(
  agent: TurnAgent,
  signal: AbortSignal,
): Promise<{ kind: "next"; agentResponse: AgentLoopNext }> {
  const produced: ModelMessage[] = [];
  let last: AgentLoopNext = {
    nextActor: "user",
    unprocessedToolCalls: [],
    copilotRequests: [],
    messages: [],
  };

  for (;;) {
    if (signal.aborted) {
      break;
    }
    const step = await agent.next(signal);
    if (signal.aborted) {
      break;
    }
    produced.push(...step.messages);
    last = { ...step, messages: [...produced] };
    if (step.nextActor === "user") {
      break;
    }
  }

  return { kind: "next", agentResponse: last };
}

function waitUntilAbort(signal: AbortSignal): Promise<CopilotResponse> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

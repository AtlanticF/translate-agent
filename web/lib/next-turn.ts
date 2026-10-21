import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ModelMessage, UserModelMessage } from "ai";
import { tsImport } from "tsx/esm/api";
import type { AgentLoopNext } from "../../src/agent/agent-loop";
import type { CopilotResponseEntry } from "../../src/messages/context";
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
  next(signal?: AbortSignal): Promise<AgentLoopNext>;
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

  const step = await agent.next(signal);
  if (step.messages.length > 0) {
    sessions.addMessages(session.id, step.messages);
  }
  return {
    status: 200,
    body: { sessionId: session.id, agentResponse: step },
  };
}

async function openLoop(messages: readonly ModelMessage[]): Promise<TurnAgent> {
  const session = (await tsImport(sessionModule, import.meta.url)) as {
    createLoop(messages: readonly ModelMessage[]): Promise<TurnAgent>;
  };
  return session.createLoop(messages);
}

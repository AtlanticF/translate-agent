import type { ModelMessage, UserModelMessage } from "ai";
import type { AgentLoopNext } from "../../src/agent/agent-loop";
import type { CopilotResponseEntry } from "../../src/messages/context";
import type { SessionStore } from "./session";

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

type TurnAgent = {
  userInput(messages: UserModelMessage[]): Promise<void>;
  addCopilotResponses(responses: readonly CopilotResponseEntry[]): void;
  next(signal?: AbortSignal): Promise<AgentLoopNext>;
};

export async function postNext(
  request: NextTurnRequest,
  signal: AbortSignal | undefined,
  sessions: SessionStore,
  openAgent: (messages: readonly ModelMessage[]) => Promise<TurnAgent> = openLoop,
): Promise<NextTurnResponse> {
  let session = request.sessionId ? await sessions.get(request.sessionId) : await sessions.create();
  if (!session) {
    return { status: 404, body: { error: "session not found" } };
  }

  const agent = await openAgent(session.messages);
  const userInput = request.userInput?.trim();
  if (userInput) {
    const messages: UserModelMessage[] = [{ role: "user", content: userInput }];
    session = await sessions.update(session.id, {
      messages: [...session.messages, ...messages],
    });
    await agent.userInput(messages);
  }

  const pendingResponses = request.copilotResponses ?? [];
  if (pendingResponses.length > 0) {
    session = await sessions.update(session.id, {
      copilotResponses: [...session.copilotResponses, ...pendingResponses],
    });
    agent.addCopilotResponses(pendingResponses);
  }

  const step = await agent.next(signal);
  if (step.messages.length > 0) {
    await sessions.update(session.id, {
      messages: [...session.messages, ...step.messages],
    });
  }
  return {
    status: 200,
    body: { sessionId: session.id, agentResponse: step },
  };
}

async function openLoop(messages: readonly ModelMessage[]): Promise<TurnAgent> {
  const session = await import("./agent-session.js");
  return session.createLoop(messages);
}

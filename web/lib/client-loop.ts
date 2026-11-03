import type { ModelMessage } from "ai";
import type { CopilotRequest, CopilotResponse } from "../../src/prompts/system.memory";
import type { NextTurnEvent } from "./next-turn";

export type ClientTurnBody = {
  sessionId?: string;
  userInput?: string;
  copilotResponses?: Array<CopilotResponse & { tool: { callId: string } }>;
};

export type ClientFile = {
  id: string;
  name: string;
  path: string;
  status: "open" | "done";
  progress: number;
};

export type ClientTurn = {
  sessionId: string;
  agentResponse: {
    messages: ModelMessage[];
    nextActor: "user" | "agent";
    copilotRequests: CopilotRequest[];
  };
  files?: ClientFile[];
};

export type ClientLiveEvent = Extract<
  NextTurnEvent,
  { type: "start" | "text-delta" | "activity" }
>;
export type ClientLiveEventHandler = (event: ClientLiveEvent) => void;

// 一步 HTTP 对应一次 next()。工具调用、工具结果、模型回复各刷一次，遇到审核或该用户说话时停下。
// 同一步返回的多条审核一起停住，由调用方集齐 copilotResponses 再继续。
export async function runTurns(
  post: (body: ClientTurnBody, onEvent?: ClientLiveEventHandler) => Promise<ClientTurn>,
  initial: ClientTurnBody,
  onStep: (turn: ClientTurn) => void,
  onEvent?: ClientLiveEventHandler,
): Promise<void> {
  let body = initial;
  for (;;) {
    const turn = await post(body, onEvent);
    onStep(turn);
    const step = turn.agentResponse;
    if (step.copilotRequests.length > 0 || step.nextActor === "user") {
      return;
    }
    // 让出一次事件循环，React 先把这一步画出来，再发下一次 /next。
    await new Promise((resolve) => setTimeout(resolve, 0));
    body = { sessionId: turn.sessionId };
  }
}

export async function postNextTurn(
  body: ClientTurnBody,
  onEvent?: ClientLiveEventHandler,
): Promise<ClientTurn> {
  const response = await fetch("/next", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(payload?.error ?? "request failed");
  }
  if (!response.body) {
    throw new Error("response stream unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: ClientTurn | undefined;

  const consume = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) {
      return;
    }
    const event = JSON.parse(data) as NextTurnEvent;
    if (event.type === "done") {
      completed = event.turn;
    } else if (event.type === "error") {
      throw new Error(event.message);
    } else {
      onEvent?.(event);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = /\r?\n\r?\n/.exec(buffer);
    while (boundary?.index !== undefined) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      consume(block);
      boundary = /\r?\n\r?\n/.exec(buffer);
    }
    if (done) {
      break;
    }
  }
  if (buffer.trim()) {
    consume(buffer);
  }
  if (!completed) {
    throw new Error("stream ended before completion");
  }
  return completed;
}

import type { ModelMessage } from "ai";
import type { CopilotRequest, CopilotResponse } from "../../src/prompts/system.memory";

export type ClientTurnBody = {
  sessionId?: string;
  userInput?: string;
  copilotResponses?: Array<CopilotResponse & { tool: { callId: string } }>;
};

export type ClientTurn = {
  sessionId: string;
  agentResponse: {
    messages: ModelMessage[];
    nextActor: "user" | "agent";
    copilotRequests: CopilotRequest[];
  };
};

// 一步 HTTP 对应一次 next()。工具调用、工具结果、模型回复各刷一次，遇到审核或该用户说话时停下。
// 同一步返回的多条审核一起停住，由调用方集齐 copilotResponses 再继续。
export async function runTurns(
  post: (body: ClientTurnBody) => Promise<ClientTurn>,
  initial: ClientTurnBody,
  onStep: (turn: ClientTurn) => void,
): Promise<void> {
  let body = initial;
  for (;;) {
    const turn = await post(body);
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

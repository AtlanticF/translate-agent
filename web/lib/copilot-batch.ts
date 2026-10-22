import type { CopilotRequest, CopilotResponse } from "../../src/prompts/system.memory";

export type CopilotReviewResponse = CopilotResponse & { tool: { callId: string } };

// 当前这批都有决定后，按请求顺序一次性提交。和 CLI 审完列表再提交一样。
export function readyCopilotResponses(
  requests: readonly CopilotRequest[],
  decisions: Readonly<Record<string, CopilotReviewResponse>>,
): CopilotReviewResponse[] | undefined {
  if (requests.length === 0) {
    return undefined;
  }
  const responses: CopilotReviewResponse[] = [];
  for (const request of requests) {
    const decision = decisions[request.tool.callId];
    if (!decision || decision.tool.callId !== request.tool.callId) {
      return undefined;
    }
    responses.push(decision);
  }
  return responses;
}

export function noteCopilotDecision(
  requests: readonly CopilotRequest[],
  decisions: Readonly<Record<string, CopilotReviewResponse>>,
  response: CopilotReviewResponse,
): {
  decisions: Readonly<Record<string, CopilotReviewResponse>>;
  ready?: CopilotReviewResponse[];
} {
  const callId = response.tool.callId;
  if (decisions[callId] || !requests.some((request) => request.tool.callId === callId)) {
    return { decisions };
  }
  const next = { ...decisions, [callId]: response };
  const ready = readyCopilotResponses(requests, next);
  return ready ? { decisions: next, ready } : { decisions: next };
}

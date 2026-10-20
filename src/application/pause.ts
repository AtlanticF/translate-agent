import type { AgentLoopNext } from "../agent/agent-loop.js";
import type { CopilotRequest } from "../prompts/system.memory.js";

export type Pause =
  | { kind: "user" }
  | { kind: "copilot"; requests: CopilotRequest[] };

// 协同请求出现时 actor 仍是 agent。先看请求，避免在同一次审核上反复调用 next。
export async function runUntilPause(
  loop: { next: (signal?: AbortSignal) => Promise<AgentLoopNext> },
  onStep?: (step: AgentLoopNext) => void,
  signal?: AbortSignal,
): Promise<Pause> {
  for (;;) {
    if (signal?.aborted) {
      return { kind: "user" };
    }
    const step = await loop.next(signal);
    if (signal?.aborted) {
      return { kind: "user" };
    }
    onStep?.(step);
    const pause = pauseFor(step);
    if (pause) {
      return pause;
    }
  }
}

function pauseFor(step: AgentLoopNext): Pause | undefined {
  if (step.copilotRequests.length > 0) {
    return { kind: "copilot", requests: step.copilotRequests };
  }
  if (step.nextActor === "user") {
    return { kind: "user" };
  }
  return undefined;
}

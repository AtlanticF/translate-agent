import type { AgentLoop, AgentLoopNext } from "../agent/agent-loop.js";
import type { CopilotRequest } from "../prompts/system.memory.js";

export type Pause =
  | { kind: "user" }
  | { kind: "copilot"; requests: CopilotRequest[] };

// 协同请求出现时 actor 仍是 agent。先看请求，避免在同一次审核上反复调用 next。
export async function runUntilPause(
  loop: Pick<AgentLoop, "next">,
  onStep?: (step: AgentLoopNext) => void,
): Promise<Pause> {
  for (;;) {
    const step = await loop.next();
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

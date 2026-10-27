import type { ModelMessage } from "ai";
import type { AgentLoop } from "../../src/agent/agent-loop";
import type { LoopIO, LoopOptions } from "../../src/application/session";

export function createLoop(
  messages?: readonly ModelMessage[],
  io?: LoopIO,
  options?: LoopOptions,
): Promise<AgentLoop>;

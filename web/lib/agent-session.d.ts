import type { ModelMessage } from "ai";
import type { AgentLoop } from "../../src/agent/agent-loop";
import type { LoopIO } from "../../src/application/session";

export function createLoop(messages?: readonly ModelMessage[], io?: LoopIO): Promise<AgentLoop>;

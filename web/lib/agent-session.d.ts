import type { ModelMessage } from "ai";
import type { AgentLoop } from "../../src/agent/agent-loop";

export function createLoop(messages?: readonly ModelMessage[]): Promise<AgentLoop>;

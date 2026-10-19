import type { FinishReason, ModelMessage, ToolSet } from "ai";
import type { Context } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import type { ToolExecutor } from "../tools/executor.js";

export type NextActor = "user" | "agent";

export type UnprocessedToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type AgentLoopNext = {
  nextActor: NextActor;
  unprocessedToolCalls: UnprocessedToolCall[];
  copilotRequests: CopilotRequest[];
  messages: ModelMessage[];
  finishReason?: FinishReason;
};

type NextStep = {
  messages: ModelMessage[];
  actor: NextActor;
  finishReason?: FinishReason;
  copilotRequests: CopilotRequest[];
};

export class AgentLoop {
  constructor(
    private readonly toolsDef: ToolSet,
    private readonly toolsExecutor: Record<string, ToolExecutor>,
    private readonly context: Context,
  ) {}

  async next(): Promise<AgentLoopNext> {
    const { messages, actor, finishReason, copilotRequests } = await this._next();
    this.context.addMessages(messages);
    const unprocessedToolCalls = this.unprocessedToolCalls();

    return {
      nextActor: actor,
      unprocessedToolCalls,
      copilotRequests,
      messages,
      finishReason,
    };
  }

  private async _next(): Promise<NextStep> {
    return {
      messages: [],
      actor: "agent",
      copilotRequests: [],
    };
  }

  private unprocessedToolCalls(): UnprocessedToolCall[] {
    return [];
  }
}

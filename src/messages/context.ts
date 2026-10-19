import type { ModelMessage } from "ai";
import type { CopilotResponse } from "../prompts/system.memory.js";

export type CopilotResponseEntry = CopilotResponse & {
  tool: { callId: string };
};

export class Context<TMessage extends ModelMessage = ModelMessage> {
  private readonly messages: TMessage[];
  private readonly copilotResponses: CopilotResponseEntry[] = [];

  constructor(messages: readonly TMessage[] = []) {
    this.messages = [...messages];
  }

  addCopilotResponses(responses: readonly CopilotResponseEntry[]): void {
    this.copilotResponses.push(...responses);
  }

  // 只返回这些 tool call 的审核记录，并拷贝一份，避免调用方改到内部状态。
  getCopilotResponses(
    toolCallIds: readonly string[],
  ): CopilotResponseEntry[] {
    const ids = new Set(toolCallIds);
    return this.copilotResponses
      .filter((response) => ids.has(response.tool.callId))
      .map((response) => ({ ...response }));
  }

  addMessages(messages: readonly TMessage[]): void {
    this.messages.push(...messages);
  }

  getMessages(): readonly TMessage[] {
    return [...this.messages];
  }

  toModelMessages(): ModelMessage[] {
    return this.messages.map((message) => toModelMessage(message));
  }
}

function toModelMessage(message: ModelMessage): ModelMessage {
  const modelMessage = {
    role: message.role,
    content: message.content,
    ...(message.providerOptions
      ? { providerOptions: message.providerOptions }
      : {}),
  };

  // ModelMessage 是联合类型，role 和 content 从同一条消息拷出。
  return modelMessage as ModelMessage;
}

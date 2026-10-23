import { generateText, type ModelMessage } from "ai";
import { models } from "../ai/llm.js";
import { COMPACT_INSTRUCTION, SYSTEM_COMPACT } from "../prompts/system.compact.js";
import type { CopilotResponse } from "../prompts/system.memory.js";

export type CopilotResponseEntry = CopilotResponse & {
  tool: { callId: string };
};

export type CompactResult = {
  analysis: string;
  summary: string;
};

export class Context<TMessage extends ModelMessage = ModelMessage> {
  private readonly messages: TMessage[];
  private activeMessages: TMessage[];
  private readonly copilotResponses: CopilotResponseEntry[] = [];

  constructor(messages: readonly TMessage[] = []) {
    this.messages = [...messages];
    this.activeMessages = [...messages];
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
    this.activeMessages.push(...messages);
  }

  getMessages(): readonly TMessage[] {
    return [...this.messages];
  }

  getModelMessages(): ModelMessage[] {
    return this.activeMessages.map((message) => toModelMessage(message));
  }

  toModelMessages(): ModelMessage[] {
    return this.getModelMessages();
  }

  // summary 替换模型正在用的消息，给人看的历史不动。
  async compact(): Promise<CompactResult> {
    const result = await generateText({
      model: models.compact,
      system: SYSTEM_COMPACT,
      messages: [
        ...this.toModelMessages(),
        { role: "user", content: COMPACT_INSTRUCTION },
      ],
      telemetry: { functionId: "compact" },
    });
    const parsed = parseCompact(result.text);
    this.activeMessages = [
      {
        role: "assistant",
        content: [{ type: "text", text: parsed.summary }],
      } as TMessage,
    ];
    return parsed;
  }
}

function parseCompact(text: string): CompactResult {
  const analysis = tagged(text, "analysis");
  const summary = tagged(text, "summary");
  if (!summary) {
    throw new Error("compact response has no summary");
  }
  return { analysis: analysis ?? "", summary };
}

function tagged(text: string, tag: string): string | undefined {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = text.lastIndexOf(open);
  if (start < 0) {
    return undefined;
  }
  const end = text.indexOf(close, start + open.length);
  if (end < 0) {
    return undefined;
  }
  const value = text.slice(start + open.length, end).trim();
  return value === "" ? undefined : value;
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

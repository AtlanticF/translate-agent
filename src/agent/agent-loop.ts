import {
  streamText,
  stepCountIs,
  type FinishReason,
  type ModelMessage,
  type ToolCallPart,
  type ToolResultPart,
  type ToolSet,
  type UserModelMessage,
} from "ai";
import { models } from "../ai/llm.js";
import type { MemorySource } from "../memory/memory.js";
import { Context, type CopilotResponseEntry } from "../messages/context.js";
import { interruptedToolResultMessage } from "../messages/repair.js";
import type { CopilotRequest, CopilotResponse } from "../prompts/system.memory.js";
import { SYSTEM_WORKFLOW } from "../prompts/system.workflow.js";
import { traceTool } from "../observability/langfuse.js";
import type { ToolExecutor } from "../tools/executor.js";

export type AgentLoopOptions = {
  memory?: MemorySource;
  skillsPrompt?: string;
};

export type NextActor = "user" | "agent";

export type AgentLoopNext = {
  nextActor: NextActor;
  unprocessedToolCalls: ToolCallPart[];
  copilotRequests: CopilotRequest[];
  messages: ModelMessage[];
  finishReason?: FinishReason;
};

export type AgentLoopEvent =
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string }
  | {
      type: "activity";
      id: string;
      kind: "tool";
      name: string;
      state: "preparing" | "running" | "done" | "error";
    };

export type AgentLoopEventHandler = (event: AgentLoopEvent) => void;

type NextStep = {
  messages: ModelMessage[];
  actor: NextActor;
  finishReason?: FinishReason;
  copilotRequests: CopilotRequest[];
};

type ToolExecution =
  | { type: "tool-result-part"; payload: ToolResultPart }
  | { type: "copilot-request"; payload: CopilotRequest };

// 无状态的一步循环。用已有 messages 构造即可恢复。协同结果仍放在这一轮的 context 里。
export class AgentLoop {
  private readonly context: Context;

  constructor(
    private readonly toolsDef: ToolSet,
    private readonly toolsExecutor: Record<string, ToolExecutor>,
    source: Context | readonly ModelMessage[] = [],
    private readonly options: AgentLoopOptions = {},
  ) {
    this.context = source instanceof Context ? source : new Context(source);
  }

  // 用户输入前先结算悬空的 tool call：普通工具立即执行；等待审核的调用视为被用户放弃，
  // 补一个 interrupted 结果。否则 user 消息会插在 tool-call 和 tool-result 之间，
  // 下一轮请求 provider 会直接报 “Tool result is missing for tool call …”。
  // 返回结算过程新产生的消息（tool 结果 + 放弃标记），调用方按此顺序持久化。
  async userInput(messages: UserModelMessage[]): Promise<ModelMessage[]> {
    const settle: ModelMessage[] = [];
    const pending = this.getUnprocessedToolCalls();
    if (pending.length > 0) {
      const step = await this.runTools(pending);
      this.context.addMessages(step.messages);
      settle.push(...step.messages);
    }
    const abandoned = this.getUnprocessedToolCalls();
    if (abandoned.length > 0) {
      const interrupted = interruptedToolResultMessage(abandoned);
      this.context.addMessages([interrupted]);
      settle.push(interrupted);
    }
    this.context.addMessages(messages);
    return settle;
  }

  addCopilotResponses(responses: readonly CopilotResponseEntry[]): void {
    this.context.addCopilotResponses(responses);
  }

  async getMessages(): Promise<ModelMessage[]> {
    return [...this.context.getMessages()];
  }

  async next(signal?: AbortSignal, emit?: AgentLoopEventHandler): Promise<AgentLoopNext> {
    if (signal?.aborted) {
      return {
        nextActor: "user",
        unprocessedToolCalls: this.getUnprocessedToolCalls(),
        copilotRequests: [],
        messages: [],
      };
    }
    const step = await this.resolveStep(signal, emit);
    // 先写入新消息，再统计未执行的 tool，返回值才能反映这一步之后的状态。
    this.context.addMessages(step.messages);

    return {
      nextActor: step.actor,
      unprocessedToolCalls: this.getUnprocessedToolCalls(),
      copilotRequests: step.copilotRequests,
      messages: step.messages,
      finishReason: step.finishReason,
    };
  }

  private async resolveStep(signal?: AbortSignal, emit?: AgentLoopEventHandler): Promise<NextStep> {
    // 还没有消息，说明是第一次进入，等用户输入。
    if (this.context.toModelMessages().length === 0) {
      return { messages: [], actor: "user", copilotRequests: [] };
    }

    const pending = this.getUnprocessedToolCalls();
    if (pending.length === 0) {
      return this.askModel(signal, emit);
    }

    return this.runTools(pending, emit);
  }

  private getUnprocessedToolCalls(): ToolCallPart[] {
    const parts: Record<string, ToolCallPart> = {};

    for (const message of this.context.getMessages()) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "tool-call") {
            parts[part.toolCallId] = part;
          }
        }
      }

      // tool-result 表示这次调用已经有结果，从待执行集合里去掉。
      if (message.role === "tool") {
        for (const part of message.content) {
          if (part.type === "tool-result") {
            delete parts[part.toolCallId];
          }
        }
      }
    }

    return Object.values(parts);
  }

  private async askModel(signal?: AbortSignal, emit?: AgentLoopEventHandler): Promise<NextStep> {
    for (let attempt = 1; attempt <= emptyResponseAttempts; attempt++) {
      let result: Awaited<ReturnType<typeof streamText>>;
      try {
        result = await streamText({
          model: models.translator,
          system: SYSTEM_WORKFLOW({
            currentMemory: this.options.memory?.provideMemory() ?? "",
            skillsPrompt: this.options.skillsPrompt,
          }),
          // 去掉 execute，避免 SDK 自己跑工具；协同请求要由这里拦截。
          tools: toolsWithoutExecute(this.toolsDef),
          messages: this.context.toModelMessages(),
          stopWhen: stepCountIs(1),
          abortSignal: signal,
          telemetry: { functionId: "translator" },
        });
        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            emit?.({ type: "text-delta", delta: part.text });
          } else if (part.type === "reasoning-delta") {
            emit?.({ type: "reasoning-delta", delta: part.text });
          } else if (part.type === "tool-input-start") {
            emit?.({
              type: "activity",
              id: part.id,
              kind: "tool",
              name: part.toolName,
              state: "preparing",
            });
          } else if (part.type === "error") {
            throw part.error;
          }
        }
      } catch (error) {
        if (signal?.aborted) {
          return { messages: [], actor: "user", copilotRequests: [] };
        }
        throw error;
      }

      // finalStep.response 是当前推荐入口，顶层 result.response 已废弃。
      const responseMessages = (await result.finalStep).response.messages;
      const finishReason = await result.finishReason;
      const messages = assignToolCallIds(responseMessages);
      // 上游超时等故障会让模型只输出 reasoning 就结束（无文本、无 tool call）。
      // 直接当作回合结束会让前端静默停止，这里按失败处理：重试，仍失败则报错。
      if (!hasUserVisibleOutput(messages)) {
        if (attempt === emptyResponseAttempts) {
          throw new Error(
            `model returned an empty response after ${attempt} attempts (possible upstream timeout)`,
          );
        }
        continue;
      }

      const lastMessage = messages.at(-1);
      // assistant 已经回复完，下一步交给用户；如果还带了 tool call，则仍由 agent 执行。
      let actor: NextActor = "user";
      if (lastMessage?.role === "assistant") {
        actor = "user";
      }
      if ((await result.toolCalls).length > 0) {
        actor = "agent";
      }

      return {
        messages,
        actor,
        finishReason,
        copilotRequests: [],
      };
    }

    throw new Error("unreachable: empty response retry loop exited");
  }

  private async runTools(
    unprocessedToolCalls: readonly ToolCallPart[],
    emit?: AgentLoopEventHandler,
  ): Promise<NextStep> {
    const copilotResponseMap = this.context
      .getCopilotResponses(unprocessedToolCalls.map((call) => call.toolCallId))
      .reduce(
        (map, response) => {
          // 同一个 callId 有多条审核时，后写入的覆盖前面的。
          map[response.tool.callId] = response;
          return map;
        },
        {} as Partial<Record<string, CopilotResponseEntry>>,
      );

    const toolResults = await Promise.all(
      unprocessedToolCalls.map((call) =>
        this.executeTool(call, copilotResponseMap[call.toolCallId], emit),
      ),
    );

    const results: ToolResultPart[] = [];
    const copilotRequests: CopilotRequest[] = [];
    for (const executed of toolResults) {
      if (executed.type === "tool-result-part") {
        results.push(executed.payload);
      } else {
        copilotRequests.push(executed.payload);
      }
    }

    return {
      // 协同请求先不写成 tool result，对应调用会继续留在未执行列表里。
      messages: results.length ? [{ role: "tool", content: results }] : [],
      // 无论是工具结果还是协同请求，都保持 agent，方便客户端继续迭代。
      actor: "agent",
      copilotRequests,
    };
  }

  private async executeTool(
    part: ToolCallPart,
    copilotResponse: CopilotResponse | undefined,
    emit?: AgentLoopEventHandler,
  ): Promise<ToolExecution> {
    const input = part.input;
    const executor = this.toolsExecutor[part.toolName];
    if (!executor) {
      throw new Error(`Tool executor not found for: ${part.toolName}`);
    }

    const options = {
      ...this.options,
      name: part.toolName,
      callId: part.toolCallId,
    };
    emit?.({
      type: "activity",
      id: part.toolCallId,
      kind: "tool",
      name: part.toolName,
      state: "running",
    });

    try {
      const result = await traceTool(part.toolName, input, () =>
        executor(input, options, copilotResponse),
      );

      if (result.type === "copilot-request") {
        return result;
      }

      emit?.({
        type: "activity",
        id: part.toolCallId,
        kind: "tool",
        name: part.toolName,
        state: "done",
      });
      return {
        type: "tool-result-part",
        payload: {
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: {
            type: "json",
            value: result.payload,
          },
        },
      };
    } catch (error) {
      emit?.({
        type: "activity",
        id: part.toolCallId,
        kind: "tool",
        name: part.toolName,
        state: "error",
      });
      // 执行失败也写成 tool result，模型下一轮能看到错误原因。
      return {
        type: "tool-result-part",
        payload: {
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: {
            type: "error-text",
            value: String(error),
          },
        },
      };
    }
  }
}

function toolsWithoutExecute(tools: ToolSet): ToolSet {
  const definitions: ToolSet = {};
  for (const [name, definition] of Object.entries(tools)) {
    const { execute: _execute, ...rest } = definition;
    definitions[name] = rest;
  }
  return definitions;
}

const emptyResponseAttempts = 3;

// 判断响应里是否有用户可见的产出：非空文本或 tool call。只剩 reasoning 视为空响应。
function hasUserVisibleOutput(messages: readonly ModelMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    if (typeof message.content === "string") {
      if (message.content.trim().length > 0) {
        return true;
      }
      continue;
    }
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool-call") {
        return true;
      }
      if (part.type === "text" && part.text.trim().length > 0) {
        return true;
      }
    }
  }
  return false;
}

// 模型给出的 toolCallId 换成我们自己的 id。同一次响应里相同的旧 id 使用同一个新 id。
function assignToolCallIds(messages: readonly ModelMessage[]): ModelMessage[] {
  const ids = new Map<string, string>();
  const nextId = (toolCallId: string) => {
    const existing = ids.get(toolCallId);
    if (existing) {
      return existing;
    }
    const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    ids.set(toolCallId, created);
    return created;
  };

  return messages.map((message) => {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === "tool-call" || part.type === "tool-result"
            ? { ...part, toolCallId: nextId(part.toolCallId) }
            : part,
        ),
      };
    }

    if (message.role === "tool") {
      return {
        ...message,
        content: message.content.map((part) =>
          part.type === "tool-result"
            ? { ...part, toolCallId: nextId(part.toolCallId) }
            : part,
        ),
      };
    }

    return message;
  });
}

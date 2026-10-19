import {
  generateText,
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
import type { Context, CopilotResponseEntry } from "../messages/context.js";
import type { CopilotRequest, CopilotResponse } from "../prompts/system.memory.js";
import { SYSTEM_WORKFLOW } from "../prompts/system.workflow.js";
import type { ToolExecutor } from "../tools/executor.js";

export type AgentLoopOptions = {
  memory?: MemorySource;
};

export type NextActor = "user" | "agent";

export type AgentLoopNext = {
  nextActor: NextActor;
  unprocessedToolCalls: ToolCallPart[];
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

type ToolExecution =
  | { type: "tool-result-part"; payload: ToolResultPart }
  | { type: "copilot-request"; payload: CopilotRequest };

// 无状态的一步循环。应用调用 next() 推进，消息和协同结果都放在 context。
export class AgentLoop {
  constructor(
    private readonly toolsDef: ToolSet,
    private readonly toolsExecutor: Record<string, ToolExecutor>,
    private readonly context: Context,
    private readonly options: AgentLoopOptions = {},
  ) {}

  async userInput(messages: UserModelMessage[]): Promise<void> {
    this.context.addMessages(messages);
  }

  async getMessages(): Promise<ModelMessage[]> {
    return [...this.context.getMessages()];
  }

  async next(): Promise<AgentLoopNext> {
    const step = await this.resolveStep();
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

  private async resolveStep(): Promise<NextStep> {
    // 还没有消息，说明是第一次进入，等用户输入。
    if (this.context.toModelMessages().length === 0) {
      return { messages: [], actor: "user", copilotRequests: [] };
    }

    const pending = this.getUnprocessedToolCalls();
    if (pending.length === 0) {
      return this.askModel();
    }

    return this.runTools(pending);
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

  private async askModel(): Promise<NextStep> {
    const result = await generateText({
      model: models.translator,
      system: SYSTEM_WORKFLOW({
        currentMemory: this.options.memory?.provideMemory() ?? "",
      }),
      // 去掉 execute，避免 SDK 自己跑工具；协同请求要由这里拦截。
      tools: toolsWithoutExecute(this.toolsDef),
      messages: this.context.toModelMessages(),
      stopWhen: stepCountIs(1),
    });

    // finalStep.response 是当前推荐入口，顶层 result.response 已废弃。
    const responseMessages = result.finalStep.response.messages;
    if (responseMessages.length === 0) {
      return {
        messages: [],
        actor: "user",
        finishReason: result.finishReason,
        copilotRequests: [],
      };
    }

    const messages = assignToolCallIds(responseMessages);
    const lastMessage = messages.at(-1);
    // assistant 已经回复完，下一步交给用户；如果还带了 tool call，则仍由 agent 执行。
    let actor: NextActor = "user";
    if (lastMessage?.role === "assistant") {
      actor = "user";
    }
    if (result.toolCalls.length > 0) {
      actor = "agent";
    }

    return {
      messages,
      actor,
      finishReason: result.finishReason,
      copilotRequests: [],
    };
  }

  private async runTools(
    unprocessedToolCalls: readonly ToolCallPart[],
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
        this.executeTool(call, copilotResponseMap[call.toolCallId]),
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
    copilotResponse?: CopilotResponse,
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

    try {
      const result = await executor(input, options, copilotResponse);

      if (result.type === "copilot-request") {
        return result;
      }

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

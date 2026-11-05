import type { ModelMessage } from "ai";
import type { CopilotRequest } from "../../src/prompts/system.memory";

const translateToolName = "Translate";

// 审核还没提交时，Translate 调用留在历史里、没有 tool result。刷新后用它把审核卡画回来。
export function pendingCopilotRequests(messages: readonly ModelMessage[]): CopilotRequest[] {
  const pending = new Map<string, CopilotRequest>();
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type !== "tool-call" || part.toolName !== translateToolName) {
          continue;
        }
        const request = requestFromInput(part.toolCallId, part.input);
        if (request) {
          pending.set(part.toolCallId, request);
        }
      }
    }
    if (message.role !== "tool") {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "tool-result") {
        pending.delete(part.toolCallId);
      }
    }
  }
  return [...pending.values()];
}

function requestFromInput(callId: string, input: unknown): CopilotRequest | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const file_path = record.file_path;
  const src_string = record.src_string;
  const translate_string = record.translate_string;
  if (
    typeof file_path !== "string" ||
    typeof src_string !== "string" ||
    typeof translate_string !== "string"
  ) {
    return undefined;
  }
  return {
    tool: { name: translateToolName, callId },
    file_path,
    src_string,
    translate_string,
  };
}

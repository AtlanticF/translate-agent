import type { ModelMessage } from "ai";

// 注意：这个模块被 web（Next/Turbopack）按值引用，除 type-only import 外不允许任何依赖，
// 否则会把 src 里其它相对导入拉进 web 编译链。

// 中断恢复时给未完成的 tool call 补一个说明性结果，让模型知道该调用没有真正执行。
export function interruptedToolResultMessage(
  calls: ReadonlyArray<{ toolCallId: string; toolName: string }>,
): ModelMessage {
  return {
    role: "tool",
    content: calls.map((call) => ({
      type: "tool-result" as const,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: {
        type: "error-text" as const,
        value:
          "This tool call was interrupted before it completed. Re-run the same tool call to continue the required workflow; do not switch to a different strategy.",
      },
    })),
  };
}

// 修复存储历史里的协议违规：assistant 的 tool-call 之后必须紧跟 tool-result，
// 中间插入 user 等消息会让 provider 直接报 “Tool result is missing for tool call …”。
// - 违规处：在 assistant 消息后补 interrupted 结果；这些调用的迟到结果按孤儿丢弃。
// - 末尾悬空的 tool-call（等待审核或继续执行）保持原样。
export function settleInterruptedToolCalls(messages: readonly ModelMessage[]): readonly ModelMessage[] {
  const output: ModelMessage[] = [];
  // 当前悬空的 tool call（都属于最近一条 assistant 消息）及其结果应插入的位置。
  let dangling: { calls: Array<{ toolCallId: string; toolName: string }>; insertAt: number } | null = null;
  let changed = false;

  const settleDangling = () => {
    if (!dangling) {
      return;
    }
    output.splice(dangling.insertAt, 0, interruptedToolResultMessage(dangling.calls));
    dangling = null;
    changed = true;
  };

  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      // 上一条 assistant 的调用还没结果又来了新 assistant：按中断处理。
      settleDangling();
      output.push(message);
      const calls = message.content
        .filter((part) => part.type === "tool-call")
        .map((part) => ({ toolCallId: part.toolCallId, toolName: part.toolName }));
      dangling = calls.length > 0 ? { calls, insertAt: output.length } : null;
      continue;
    }

    if (message.role === "tool" && Array.isArray(message.content)) {
      const results = message.content.filter((part) => part.type === "tool-result");
      const wanted = dangling
        ? results.filter((part) => dangling!.calls.some((call) => call.toolCallId === part.toolCallId))
        : [];
      const orphans = results.filter((part) => !wanted.includes(part));
      if (orphans.length > 0) {
        changed = true;
      }
      if (wanted.length === 0) {
        continue;
      }
      // 正常历史里 tool 消息本来就紧跟 assistant；被 user 消息隔开时把结果挪回原位。
      const insertAt = dangling!.insertAt;
      const inPlace = insertAt === output.length;
      output.splice(insertAt, 0, { ...message, content: wanted });
      dangling!.insertAt += 1;
      for (const part of wanted) {
        dangling!.calls = dangling!.calls.filter((call) => call.toolCallId !== part.toolCallId);
      }
      if (!inPlace || orphans.length > 0) {
        changed = true;
      }
      if (dangling!.calls.length === 0) {
        dangling = null;
      }
      continue;
    }

    // user / 其他消息出现在悬空 tool-call 之后：视为中断，先补结果再继续。
    settleDangling();
    output.push(message);
  }

  return changed ? output : messages;
}

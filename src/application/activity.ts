import type { AgentLoopNext } from "../agent/agent-loop.js";

export type ActivityItem = {
  variant: "info" | "success" | "error" | "warning";
  text: string;
};

const maxLineLength = 80;

export function activityItems(step: AgentLoopNext): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const message of step.messages) {
    if (message.role === "assistant") {
      items.push(...assistantItems(message.content));
    }
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result") {
          continue;
        }
        items.push(
          part.output.type === "error-text"
            ? { variant: "error", text: `${part.toolName} 失败` }
            : { variant: "success", text: `${part.toolName} 完成` },
        );
      }
    }
  }

  if (step.copilotRequests.length > 0) {
    items.push({
      variant: "warning",
      text: `等待审核 ${step.copilotRequests.length} 条`,
    });
  }

  return items;
}

// 还有未完成的工具就显示调用；否则下一步会去问模型。
export function waitingLabel(step: AgentLoopNext): string {
  const names = [...new Set(step.unprocessedToolCalls.map((call) => call.toolName))];
  if (names.length === 0) {
    return "正在思考";
  }
  return `正在调用 ${names.join("、")}`;
}

function assistantItems(content: AgentLoopNext["messages"][number]["content"]): ActivityItem[] {
  if (typeof content === "string") {
    const text = clip(content);
    return text ? [{ variant: "info", text: `回复 ${text}` }] : [];
  }

  const items: ActivityItem[] = [];
  for (const part of content) {
    if (part.type === "text") {
      const text = clip(part.text);
      if (text) {
        items.push({ variant: "info", text: `回复 ${text}` });
      }
    }
    if (part.type === "tool-call") {
      items.push({ variant: "info", text: `调用 ${part.toolName}` });
    }
  }
  return items;
}

function clip(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= maxLineLength) {
    return line;
  }
  return `${line.slice(0, maxLineLength - 1)}…`;
}

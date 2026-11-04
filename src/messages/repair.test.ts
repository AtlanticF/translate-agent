import type { ModelMessage } from "ai";
import { expect, test } from "vitest";
import { settleInterruptedToolCalls } from "./repair.js";

const toolCall = (id: string, name = "Translate") => ({
  type: "tool-call" as const,
  toolCallId: id,
  toolName: name,
  input: {},
});

const toolResult = (id: string, name = "Translate") => ({
  type: "tool-result" as const,
  toolCallId: id,
  toolName: name,
  output: { type: "json" as const, value: { ok: true } },
});

test("keeps protocol-valid history untouched", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "go" },
    { role: "assistant", content: [toolCall("call-1")] },
    { role: "tool", content: [toolResult("call-1")] },
    { role: "assistant", content: "done" },
  ];

  expect(settleInterruptedToolCalls(messages)).toBe(messages);
});

test("keeps tail-dangling calls awaiting review", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "go" },
    { role: "assistant", content: [toolCall("call-1")] },
  ];

  expect(settleInterruptedToolCalls(messages)).toBe(messages);
});

test("inserts an interrupted result between call and later user message", () => {
  const messages: ModelMessage[] = [
    { role: "assistant", content: [toolCall("call-1", "Translate")] },
    { role: "user", content: "继续" },
    { role: "tool", content: [toolResult("call-1")] },
  ];

  const repaired = settleInterruptedToolCalls(messages);

  expect(repaired).toHaveLength(3);
  expect(repaired[0]).toEqual(messages[0]);
  const settled = repaired[1] as Extract<ModelMessage, { role: "tool" }>;
  expect(settled.content[0]).toMatchObject({
    type: "tool-result",
    toolCallId: "call-1",
    toolName: "Translate",
    output: { type: "error-text" },
  });
  // 迟到的真实结果按孤儿丢弃，user 消息保留在补齐的结果之后。
  expect(repaired[2]).toEqual({ role: "user", content: "继续" });
});

test("settles before a following assistant message", () => {
  const messages: ModelMessage[] = [
    { role: "assistant", content: [toolCall("call-1")] },
    { role: "assistant", content: "text only" },
  ];

  const repaired = settleInterruptedToolCalls(messages);

  expect(repaired).toHaveLength(3);
  expect(repaired[1].role).toBe("tool");
  expect(repaired[2]).toEqual({ role: "assistant", content: "text only" });
});

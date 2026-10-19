import { expect, test } from "vitest";
import type { AgentLoopNext } from "../agent/agent-loop.js";
import { activityItems, waitingLabel } from "./activity.js";

test("describes a reply, a tool call, and the next wait", () => {
  const step: AgentLoopNext = {
    nextActor: "agent",
    copilotRequests: [],
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "先看目录" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "LS",
            input: { path: "/tmp" },
          },
        ],
      },
    ],
    unprocessedToolCalls: [
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "LS",
        input: { path: "/tmp" },
      },
    ],
  };

  expect(activityItems(step)).toEqual([
    { variant: "info", text: "回复 先看目录" },
    { variant: "info", text: "调用 LS" },
  ]);
  expect(waitingLabel(step)).toBe("正在调用 LS");
});

test("describes a finished tool and a failed tool", () => {
  const step: AgentLoopNext = {
    nextActor: "agent",
    copilotRequests: [],
    unprocessedToolCalls: [],
    messages: [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "Read",
            output: { type: "json", value: { lines: [] } },
          },
          {
            type: "tool-result",
            toolCallId: "call-2",
            toolName: "LS",
            output: { type: "error-text", value: "missing" },
          },
        ],
      },
    ],
  };

  expect(activityItems(step)).toEqual([
    { variant: "success", text: "Read 完成" },
    { variant: "error", text: "LS 失败" },
  ]);
  expect(waitingLabel(step)).toBe("正在思考");
});

test("notes when a translation is waiting for review", () => {
  const step: AgentLoopNext = {
    nextActor: "agent",
    unprocessedToolCalls: [],
    messages: [],
    copilotRequests: [
      {
        src_string: "hello",
        translate_string: "你好",
        file_path: "/tmp/note.txt",
        tool: { name: "Translate", callId: "call-1" },
      },
    ],
  };

  expect(activityItems(step)).toEqual([{ variant: "warning", text: "等待审核 1 条" }]);
});

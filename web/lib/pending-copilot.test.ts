import { expect, test } from "vitest";
import { pendingCopilotRequests } from "./pending-copilot";

const call = {
  type: "tool-call" as const,
  toolCallId: "call-1",
  toolName: "Translate",
  input: {
    file_path: "/tmp/article.md",
    src_string: "hello",
    translate_string: "你好",
  },
};

test("restores a translate call that is still waiting for review", () => {
  expect(
    pendingCopilotRequests([
      { role: "user", content: "translate" },
      { role: "assistant", content: [call] },
    ]),
  ).toEqual([
    {
      tool: { name: "Translate", callId: "call-1" },
      file_path: "/tmp/article.md",
      src_string: "hello",
      translate_string: "你好",
    },
  ]);
});

test("keeps every unfinished review and drops finished or unrelated calls", () => {
  expect(
    pendingCopilotRequests([
      {
        role: "assistant",
        content: [
          call,
          { ...call, toolCallId: "call-2", input: { ...call.input, src_string: "world" } },
          { type: "tool-call", toolCallId: "read-1", toolName: "Read", input: { file_path: "/tmp/a" } },
          { type: "tool-call", toolCallId: "bad", toolName: "Translate", input: { text: "nope" } },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "Translate",
            output: { type: "json", value: { status: "approve" } },
          },
        ],
      },
    ]),
  ).toEqual([
    {
      tool: { name: "Translate", callId: "call-2" },
      file_path: "/tmp/article.md",
      src_string: "world",
      translate_string: "你好",
    },
  ]);
});

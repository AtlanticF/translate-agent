import { expect, test } from "vitest";
import type { ModelMessage } from "ai";
import { transcriptBlocks } from "./transcript.js";

const messages: ModelMessage[] = [
  { role: "user", content: "list the directory" },
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "LS",
        input: { path: "/tmp/proj" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "LS",
        output: {
          type: "json",
          value: [{ name: ".DS_Store", type: "file" }],
        },
      },
    ],
  },
];

test("shows the user prompt and the finished ls result", () => {
  expect(transcriptBlocks(messages)).toEqual([
    { kind: "user", text: "list the directory" },
    {
      kind: "assistant",
      text: "",
      tools: [
        {
          callId: "call-1",
          lines: [
            "ls done",
            "entries:",
            "  name: .DS_Store",
            "  type: file",
            "  path: /tmp/proj/.DS_Store",
          ],
        },
      ],
    },
  ]);
});

test("keeps a failed tool visible", () => {
  const failed: ModelMessage[] = [
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-2",
          toolName: "LS",
          output: { type: "error-text", value: "missing" },
        },
      ],
    },
  ];

  expect(transcriptBlocks(failed)[0]).toMatchObject({
    kind: "assistant",
    tools: [{ lines: ["ls failed", "missing"] }],
  });
});

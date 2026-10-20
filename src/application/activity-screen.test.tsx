import { renderToString } from "ink";
import { expect, test } from "vitest";
import type { ModelMessage } from "ai";
import { ActivityScreen } from "./activity-screen.js";
import { processingLabel } from "./transcript.js";

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

test("shows the tool result and keeps processing when the agent continues", () => {
  const output = renderToString(<ActivityScreen messages={messages} processing />);

  expect(output).toContain("user:");
  expect(output).toContain("list the directory");
  expect(output).toContain("assistant:");
  expect(output).toContain("tool:");
  expect(output).toContain("ls done");
  expect(output).toContain("name: .DS_Store");
  expect(output).toContain("path: /tmp/proj/.DS_Store");
  expect(output).toContain(processingLabel);
  expect(output).toContain("╭");
});

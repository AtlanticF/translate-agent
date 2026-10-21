import { expect, test } from "vitest";
import { toolTitle, viewItems } from "./view-items";

test("shows user text, assistant text, and a tool from call through result", () => {
  const items = viewItems([
    { role: "user", content: "translate this" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Reading the file." },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "Read",
          input: { path: "/tmp/readme" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "Read",
          output: { type: "json", value: { text: "hello" } },
        },
      ],
    },
  ]);

  expect(items.map((item) => item.kind)).toEqual(["user", "assistant", "tool"]);
  expect(items[2]).toMatchObject({
    name: "Read",
    state: "done",
  });
  expect(toolTitle(items[2] as Extract<(typeof items)[number], { kind: "tool" }>)).toBe(
    "Ran Read",
  );
});

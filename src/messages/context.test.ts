import type { ModelMessage } from "ai";
import { expect, test } from "vitest";
import { Context } from "./context.js";

test("starts empty", () => {
  const context = new Context();

  expect(context.getMessages()).toEqual([]);
  expect(context.toModelMessages()).toEqual([]);
});

test("appends messages in order", () => {
  const context = new Context<ModelMessage>([
    { role: "system", content: "system" },
  ]);

  context.addMessages([{ role: "user", content: "user" }]);
  context.addMessages([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "read",
          input: { path: "a.txt" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "read",
          output: { type: "text", value: "file" },
        },
      ],
    },
  ]);

  expect(context.getMessages().map((message) => message.role)).toEqual([
    "system",
    "user",
    "assistant",
    "tool",
  ]);
  expect(context.toModelMessages()).toEqual(context.getMessages());
});

test("keeps extension fields in getMessages and omits them from model messages", () => {
  type NotedMessage = ModelMessage & { note: string };
  const context = new Context<NotedMessage>([
    {
      role: "user",
      content: "hello",
      note: "source",
      providerOptions: { openai: { user: "matt" } },
    },
  ]);

  expect(context.getMessages()).toEqual([
    {
      role: "user",
      content: "hello",
      note: "source",
      providerOptions: { openai: { user: "matt" } },
    },
  ]);
  expect(context.toModelMessages()).toEqual([
    {
      role: "user",
      content: "hello",
      providerOptions: { openai: { user: "matt" } },
    },
  ]);
});

test("returned lists do not change the stored messages", () => {
  const initial: ModelMessage[] = [{ role: "user", content: "a" }];
  const context = new Context(initial);

  initial.push({ role: "user", content: "b" });
  const snapshot = context.getMessages() as ModelMessage[];
  snapshot.push({ role: "user", content: "c" });
  context.addMessages([]);

  expect(context.getMessages()).toEqual([{ role: "user", content: "a" }]);
});

import { generateText, type ModelMessage } from "ai";
import { beforeEach, expect, test, vi } from "vitest";
import { Context } from "./context.js";
import { COMPACT_INSTRUCTION, SYSTEM_COMPACT } from "../prompts/system.compact.js";

vi.mock("../ai/llm.js", () => ({
  models: {
    translator: { modelId: "translator-test" },
    compact: { modelId: "compact-test" },
  },
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

const generateTextMock = vi.mocked(generateText);

beforeEach(() => {
  generateTextMock.mockReset();
});

test("starts empty", () => {
  const context = new Context();

  expect(context.getMessages()).toEqual([]);
  expect(context.getModelMessages()).toEqual([]);
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

test("returns copilot responses for the requested tool calls", () => {
  const context = new Context();
  const approve = {
    tool: { callId: "call-1" },
    status: "approve" as const,
  };
  const refined = {
    tool: { callId: "call-1" },
    status: "refined" as const,
    refined_translated_string: "您好",
  };
  const other = {
    tool: { callId: "call-2" },
    status: "reject" as const,
    reason: "语气不对",
  };

  context.addCopilotResponses([approve, other, refined]);

  expect(context.getCopilotResponses(["call-1"])).toEqual([approve, refined]);
  expect(context.getCopilotResponses(["call-2", "missing"])).toEqual([other]);
});

test("keeps human history and replaces the model messages on compact", async () => {
  generateTextMock.mockResolvedValue({
    text: "<analysis>\n shortened \n</analysis>\n<summary>\n hello world \n</summary>",
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const context = new Context<ModelMessage>([{ role: "user", content: "translate" }]);
  context.addMessages([{ role: "assistant", content: "done" }]);

  await expect(context.compact()).resolves.toEqual({
    analysis: "shortened",
    summary: "hello world",
  });

  expect(context.getMessages()).toEqual([
    { role: "user", content: "translate" },
    { role: "assistant", content: "done" },
  ]);
  const summary = {
    role: "assistant",
    content: [{ type: "text", text: "hello world" }],
  };
  expect(context.getModelMessages()).toEqual([summary]);
  expect(context.toModelMessages()).toEqual([summary]);
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      model: { modelId: "compact-test" },
      system: SYSTEM_COMPACT,
      messages: [
        { role: "user", content: "translate" },
        { role: "assistant", content: "done" },
        { role: "user", content: COMPACT_INSTRUCTION },
      ],
    }),
  );
});

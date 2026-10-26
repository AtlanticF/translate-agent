import { generateText, type ModelMessage } from "ai";
import { beforeEach, expect, test, vi } from "vitest";
import { Context } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import type { ToolExecutor } from "../tools/executor.js";
import { lsTool } from "../tools/ls-tool.js";
import { AgentLoop } from "./agent-loop.js";

vi.mock("../ai/llm.js", () => ({
  models: {
    translator: { modelId: "translator-test" },
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

test("restores the loop from messages", async () => {
  const messages = [{ role: "user" as const, content: "hello" }];
  const loop = new AgentLoop({}, {}, messages);

  await expect(loop.getMessages()).resolves.toEqual(messages);
});

test("asks the user when the context is empty", async () => {
  const context = new Context();
  const loop = new AgentLoop({}, {}, context);

  const result = await loop.next();

  expect(result).toEqual({
    nextActor: "user",
    unprocessedToolCalls: [],
    copilotRequests: [],
    messages: [],
    finishReason: undefined,
  });
  expect(generateTextMock).not.toHaveBeenCalled();
  await expect(loop.getMessages()).resolves.toEqual([]);
});

test("stores user messages and returns the model reply", async () => {
  generateTextMock.mockResolvedValue({
    toolCalls: [],
    finishReason: "stop",
    finalStep: {
      response: {
        messages: [{ role: "assistant", content: "done" }],
      },
    },
  } as unknown as Awaited<ReturnType<typeof generateText>>);

  const context = new Context();
  const loop = new AgentLoop({}, {}, context);
  const user = { role: "user" as const, content: "translate README" };

  await loop.userInput([user]);
  expect(generateTextMock).not.toHaveBeenCalled();
  await expect(loop.getMessages()).resolves.toEqual([user]);

  const result = await loop.next();

  expect(result.nextActor).toBe("user");
  expect(result.finishReason).toBe("stop");
  expect(result.messages).toEqual([{ role: "assistant", content: "done" }]);
  expect(result.copilotRequests).toEqual([]);
  await expect(loop.getMessages()).resolves.toEqual([
    user,
    { role: "assistant", content: "done" },
  ]);
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      system: expect.stringContaining("You are a translation agent."),
      messages: [user],
      stopWhen: expect.any(Function),
    }),
  );
});

test("stops the model call when the signal is aborted", async () => {
  const signal = new AbortController();
  generateTextMock.mockImplementation(async () => {
    signal.abort();
    throw new Error("aborted");
  });
  const context = new Context([{ role: "user", content: "translate" }]);
  const loop = new AgentLoop({}, {}, context);

  await expect(loop.next(signal.signal)).resolves.toMatchObject({
    nextActor: "user",
    messages: [],
    copilotRequests: [],
  });
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({ abortSignal: signal.signal }),
  );
  await expect(loop.getMessages()).resolves.toEqual([{ role: "user", content: "translate" }]);
});

test("sends saved preferences to the translator", async () => {
  generateTextMock.mockResolvedValue({
    toolCalls: [],
    finishReason: "stop",
    finalStep: {
      response: { messages: [{ role: "assistant", content: "done" }] },
    },
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const loop = new AgentLoop({}, {}, new Context([{ role: "user", content: "go" }]), {
    memory: {
      provideMemory: () => "Use 您. (style)",
      extractMemory: vi.fn(),
    },
  });

  await loop.next();

  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      system: expect.stringContaining("Use 您. (style)"),
    }),
  );
});

test("sends the skills catalog and activation policy to the translator", async () => {
  generateTextMock.mockResolvedValue({
    toolCalls: [],
    finishReason: "stop",
    finalStep: {
      response: { messages: [{ role: "assistant", content: "done" }] },
    },
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const skillsPrompt = "<available_skills><skill><name>pdf-processing</name></skill></available_skills>";
  const loop = new AgentLoop({}, {}, new Context([{ role: "user", content: "go" }]), {
    skillsPrompt,
  });

  await loop.next();

  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      system: expect.stringContaining(skillsPrompt),
    }),
  );
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      system: expect.stringContaining("Always start by reading the skill location file"),
    }),
  );
});

test("returns the user when the model response has no messages", async () => {
  generateTextMock.mockResolvedValue({
    toolCalls: [{ toolCallId: "call-1", toolName: "LS", input: { path: "." } }],
    finishReason: "length",
    finalStep: { response: { messages: [] } },
  } as unknown as Awaited<ReturnType<typeof generateText>>);

  const loop = new AgentLoop({}, {}, new Context([{ role: "user", content: "go" }]));
  const result = await loop.next();

  expect(result.nextActor).toBe("user");
  expect(result.finishReason).toBe("length");
  expect(result.messages).toEqual([]);
});

test("rewrites tool call ids and leaves the next step with the agent", async () => {
  generateTextMock.mockResolvedValue({
    toolCalls: [{ toolCallId: "model-1", toolName: "LS", input: { path: "." } }],
    finishReason: "tool-calls",
    finalStep: {
      response: {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "model-1",
                toolName: "LS",
                input: { path: "." },
              },
            ],
          },
        ],
      },
    },
  } as unknown as Awaited<ReturnType<typeof generateText>>);

  const loop = new AgentLoop(
    { LS: lsTool },
    {},
    new Context([{ role: "user", content: "list files" }]),
  );

  const result = await loop.next();
  const call = result.unprocessedToolCalls[0];

  expect(result.nextActor).toBe("agent");
  expect(result.finishReason).toBe("tool-calls");
  expect(call?.toolCallId).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
  expect(call?.toolCallId).not.toBe("model-1");
  expect(result.messages).toEqual([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: call?.toolCallId,
          toolName: "LS",
          input: { path: "." },
        },
      ],
    },
  ]);
  expect(generateTextMock.mock.calls[0]?.[0].tools?.LS?.execute).toBeUndefined();
});

test("runs a pending tool and records the result", async () => {
  const executor = vi.fn<ToolExecutor>(async () => ({
    type: "json",
    payload: [{ name: "a.txt", type: "file" }],
  }));
  const context = new Context<ModelMessage>([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "LS",
          input: { path: "/tmp" },
        },
      ],
    },
  ]);
  const loop = new AgentLoop({}, { LS: executor }, context);

  const result = await loop.next();

  expect(executor).toHaveBeenCalledWith(
    { path: "/tmp" },
    { name: "LS", callId: "call-1" },
    undefined,
  );
  expect(result.nextActor).toBe("agent");
  expect(result.copilotRequests).toEqual([]);
  expect(result.unprocessedToolCalls).toEqual([]);
  expect(result.messages).toEqual([
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "LS",
          output: {
            type: "json",
            value: [{ name: "a.txt", type: "file" }],
          },
        },
      ],
    },
  ]);
  expect(generateTextMock).not.toHaveBeenCalled();
});

test("passes the stored copilot response into the pending tool", async () => {
  const response = {
    tool: { callId: "call-1" },
    status: "approve" as const,
  };
  const executor = vi.fn<ToolExecutor>(async () => ({
    type: "json",
    payload: { status: "approve" },
  }));
  const context = new Context([
    {
      role: "assistant" as const,
      content: [
        {
          type: "tool-call" as const,
          toolCallId: "call-1",
          toolName: "Translate",
          input: { text: "hello" },
        },
      ],
    },
  ]);
  context.addCopilotResponses([response]);
  const loop = new AgentLoop({}, { Translate: executor }, context);

  await loop.next();

  expect(executor).toHaveBeenCalledWith(
    { text: "hello" },
    { name: "Translate", callId: "call-1" },
    response,
  );
});

test("keeps the agent when a tool asks for review", async () => {
  const request: CopilotRequest = {
    src_string: "hello",
    translate_string: "你好",
    file_path: "/tmp/readme",
    tool: { name: "Translate", callId: "call-1" },
  };
  const executor = vi.fn<ToolExecutor>(async () => ({
    type: "copilot-request",
    payload: request,
  }));
  const call = {
    type: "tool-call" as const,
    toolCallId: "call-1",
    toolName: "Translate",
    input: { text: "hello" },
  };
  const loop = new AgentLoop(
    {},
    { Translate: executor },
    new Context([{ role: "assistant", content: [call] }]),
  );

  const result = await loop.next();

  expect(result.nextActor).toBe("agent");
  expect(result.copilotRequests).toEqual([request]);
  expect(result.messages).toEqual([]);
  expect(result.unprocessedToolCalls).toEqual([call]);
});

test("turns a tool failure into an error result", async () => {
  const executor = vi.fn<ToolExecutor>(async () => {
    throw new Error("disk full");
  });
  const loop = new AgentLoop(
    {},
    { LS: executor },
    new Context([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "LS",
            input: { path: "/missing" },
          },
        ],
      },
    ]),
  );

  const result = await loop.next();

  expect(result.messages).toEqual([
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "LS",
          output: { type: "error-text", value: "Error: disk full" },
        },
      ],
    },
  ]);
  expect(result.unprocessedToolCalls).toEqual([]);
});

test("rejects a tool call that has no executor", async () => {
  const loop = new AgentLoop(
    {},
    {},
    new Context([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "LS",
            input: { path: "." },
          },
        ],
      },
    ]),
  );

  await expect(loop.next()).rejects.toThrow(
    "Tool executor not found for: LS",
  );
});

test("ignores a tool call that already has a result", async () => {
  generateTextMock.mockResolvedValue({
    toolCalls: [],
    finishReason: "stop",
    finalStep: {
      response: { messages: [{ role: "assistant", content: "listed" }] },
    },
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const executor = vi.fn<ToolExecutor>();
  const loop = new AgentLoop(
    {},
    { LS: executor },
    new Context([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "LS",
            input: { path: "." },
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
            output: { type: "json", value: [] },
          },
        ],
      },
    ]),
  );

  const result = await loop.next();

  expect(executor).not.toHaveBeenCalled();
  expect(result.nextActor).toBe("user");
  expect(generateTextMock).toHaveBeenCalledOnce();
});

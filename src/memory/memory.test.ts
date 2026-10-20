import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText } from "ai";
import { beforeEach, expect, test, vi } from "vitest";
import type { CopilotRequest, CopilotResponse } from "../prompts/system.memory.js";
import { Memory, type MemoryOp } from "./memory.js";

vi.mock("../ai/llm.js", () => ({
  models: {
    memory: { modelId: "memory-test" },
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

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/readme.md",
  tool: { name: "Translate", callId: "call-1" },
};

const rejected: CopilotResponse = { status: "reject", reason: "语气不对" };

async function tempMemory(): Promise<{ memory: Memory; filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "memory-"));
  const filePath = join(directory, "memory.json");
  return { memory: new Memory(filePath), filePath };
}

test("starts empty when the file is missing", async () => {
  const { memory } = await tempMemory();

  await memory.init();

  expect(memory.current).toEqual([]);
  expect(memory.provideMemory()).toBe("");
});

test("loads an existing list and ignores a file that is not a list", async () => {
  const { memory, filePath } = await tempMemory();
  const stored = [{ index: 0, text: "Use 您.", tags: ["style"] }];
  const writer = new Memory(filePath);
  writer.current = stored;
  await writer.save();

  await memory.init();
  expect(memory.current).toEqual(stored);

  await writeFile(filePath, JSON.stringify({ ops: [] }));
  await memory.init();
  expect(memory.current).toEqual([]);
});

test("applies add, update, and delete", async () => {
  const memory = new Memory("/tmp/unused-memory.json");
  const ops: MemoryOp[] = [
    { action: "add", index: -1, text: "Use 您.", tags: ["style"] },
    { action: "add", index: -1, text: "Keep names.", tags: ["terminology"] },
    { action: "delete", index: 0, text: "", tags: [] },
    { action: "update", index: 1, text: "Keep product names.", tags: ["terminology", "preference"] },
    { action: "update", index: 9, text: "missing", tags: ["style"] },
    { action: "delete", index: 9, text: "", tags: [] },
  ];

  memory.applyOps(ops);

  expect(memory.current).toEqual([
    {
      index: 0,
      text: "Keep product names.",
      tags: ["terminology", "preference"],
    },
  ]);
  expect(memory.provideMemory()).toBe(
    "Keep product names. (terminology,preference)",
  );
});

test("renumbers indexes after a delete leaves a gap", () => {
  const memory = new Memory("/tmp/unused-memory.json");
  memory.current = [
    { index: 0, text: "A", tags: ["style"] },
    { index: 1, text: "B", tags: ["style"] },
  ];

  memory.applyOps([
    { action: "delete", index: 0, text: "", tags: [] },
    { action: "add", index: -1, text: "C", tags: ["preference"] },
  ]);

  expect(memory.current).toEqual([
    { index: 0, text: "B", tags: ["style"] },
    { index: 1, text: "C", tags: ["preference"] },
  ]);
});

test("renumbers duplicate indexes when the file is loaded", async () => {
  const { memory, filePath } = await tempMemory();
  await writeFile(
    filePath,
    JSON.stringify([
      { index: 1, text: "A", tags: ["style"] },
      { index: 1, text: "B", tags: ["style"] },
    ]),
  );

  await memory.init();

  expect(memory.current).toEqual([
    { index: 0, text: "A", tags: ["style"] },
    { index: 1, text: "B", tags: ["style"] },
  ]);
});

test("saves the list and reads it back", async () => {
  const { memory, filePath } = await tempMemory();
  memory.current = [{ index: 0, text: "Use 您.", tags: ["style"] }];

  await memory.save();

  const saved = await readFile(filePath, "utf8");
  expect(saved).toBe(JSON.stringify(memory.current, null, 2));

  const restored = new Memory(filePath);
  await restored.init();
  expect(restored.current).toEqual(memory.current);
  expect(restored.provideMemory()).toBe("Use 您. (style)");
});

test("extracts ops from the memory model and saves them", async () => {
  generateTextMock.mockResolvedValue({
    text: `{"ops":[{"action":"add","index":-1,"text":"Use 您.","tags":["style"]}]}`,
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const { memory, filePath } = await tempMemory();
  await memory.init();

  await memory.extractMemory({ req: request, res: rejected });

  expect(memory.current).toEqual([
    { index: 0, text: "Use 您.", tags: ["style"] },
  ]);
  expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(memory.current);
  expect(generateTextMock).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.stringContaining("[]"),
      providerOptions: {
        openrouter: {
          reasoning: { enabled: false },
        },
      },
    }),
  );
});

test("reads the ops object when the model adds text after it", async () => {
  generateTextMock.mockResolvedValue({
    text: [
      "{",
      '  "ops": [',
      '    {"action":"add","index":-1,"text":"Use 您.","tags":["style"]}',
      "  ]",
      "}",
      "用户把 {你好} 改成了 {您好}",
    ].join("\n"),
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const { memory } = await tempMemory();
  await memory.init();

  await memory.extractMemory({ req: request, res: rejected });

  expect(memory.current).toEqual([
    { index: 0, text: "Use 您.", tags: ["style"] },
  ]);
});

test("uses only the last valid ops payload", async () => {
  generateTextMock.mockResolvedValue({
    text: [
      '{"ops":[{"action":"add","index":-1,"text":"Use 您.","tags":["style"]}]}',
      '{"ops":[{"action":"add","index":-1,"text":"Keep names.","tags":["terminology"]}]}',
    ].join("\n"),
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const { memory } = await tempMemory();
  await memory.init();

  await memory.extractMemory({ req: request, res: rejected });

  expect(memory.current).toEqual([
    { index: 0, text: "Keep names.", tags: ["terminology"] },
  ]);
});

test("ignores a draft inside the thinking block", async () => {
  generateTextMock.mockResolvedValue({
    text: [
      "Thinking Process:",
      "```json",
      '{"ops":[{"action":"add","index":-1,"text":"Draft.","tags":["style"]}]}',
      "```",
      "</think>",
      '{"ops":[{"action":"add","index":-1,"text":"Use 您.","tags":["style"]}]}',
    ].join("\n"),
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const { memory } = await tempMemory();
  await memory.init();

  await memory.extractMemory({ req: request, res: rejected });

  expect(memory.current).toEqual([
    { index: 0, text: "Use 您.", tags: ["style"] },
  ]);
});

test("does not apply an earlier draft when the last ops payload is invalid", async () => {
  generateTextMock.mockResolvedValue({
    text: [
      '{"ops":[{"action":"add","index":-1,"text":"Use 您.","tags":["style"]}]}',
      '{"ops":[{"action":"add","index":-1,"text":"broken"}]}',
    ].join("\n"),
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const { memory } = await tempMemory();
  memory.current = [{ index: 0, text: "Keep.", tags: ["style"] }];
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  await memory.extractMemory({ req: request, res: rejected });

  expect(memory.current).toEqual([{ index: 0, text: "Keep.", tags: ["style"] }]);
  error.mockRestore();
});

test("keeps the current list when the memory response is not JSON", async () => {
  generateTextMock.mockResolvedValue({
    text: "not json",
  } as unknown as Awaited<ReturnType<typeof generateText>>);
  const { memory } = await tempMemory();
  memory.current = [{ index: 0, text: "Use 您.", tags: ["style"] }];
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  await memory.extractMemory({ req: request, res: rejected });

  expect(memory.current).toEqual([
    { index: 0, text: "Use 您.", tags: ["style"] },
  ]);
  error.mockRestore();
});

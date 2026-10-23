import { expect, test, vi } from "vitest";
import {
  createTranslateExecutor,
  translateTool,
  type TranslateWriter,
} from "./translate-tool.js";

const filePath = "/tmp/readme.md";
const input = {
  file_path: filePath,
  src_string: "hello",
  translate_string: "你好",
};
const options = { name: "Translate", callId: "call-1" };

function executor(
  writer: TranslateWriter = vi.fn(async () => {}),
  read: (filePath: string) => Promise<string> = async () => "hello",
) {
  return { writer, run: createTranslateExecutor({ writer, read }) };
}

test("is the Translate tool", () => {
  expect(translateTool).toMatchObject({
    name: "Translate",
    description: expect.stringContaining("absolute"),
    inputSchema: expect.anything(),
    outputSchema: expect.anything(),
  });
});

test("rejects a relative file path", async () => {
  const { run } = executor();

  await expect(
    run({ ...input, file_path: "readme.md" }, options),
  ).rejects.toThrow("file_path must be an absolute path");
});

test("rejects a source string longer than 300 characters", async () => {
  const { run, writer } = executor();

  await expect(
    run({ ...input, src_string: "a".repeat(301) }, options),
  ).resolves.toEqual({
    type: "json",
    payload: {
      translated_string: "",
      status: "reject",
      reason: "Source string exceeds maximum length of 300 characters",
    },
  });
  expect(writer).not.toHaveBeenCalled();
});

test("asks for review before a human response exists", async () => {
  const { run, writer } = executor();

  await expect(run(input, options)).resolves.toEqual({
    type: "copilot-request",
    payload: {
      tool: { name: "Translate", callId: "call-1" },
      ...input,
    },
  });
  expect(writer).not.toHaveBeenCalled();
});

test("writes the draft when the review is approved", async () => {
  const { run, writer } = executor();

  await expect(
    run(input, options, { status: "approve" }),
  ).resolves.toEqual({
    type: "json",
    payload: {
      translated_string: "你好",
      status: "approve",
      reason: "",
    },
  });
  expect(writer).toHaveBeenCalledWith({
    contents: "你好",
    file_path: filePath,
    translated_string: "你好",
    source_start: 0,
    source_end: 5,
  });
});

test("writes the corrected string when the review is refined", async () => {
  const { run, writer } = executor();

  await expect(
    run(input, options, {
      status: "refined",
      refined_translated_string: "您好",
    }),
  ).resolves.toEqual({
    type: "json",
    payload: {
      translated_string: "您好",
      status: "refined",
      reason: "",
    },
  });
  expect(writer).toHaveBeenCalledWith({
    contents: "您好",
    file_path: filePath,
    translated_string: "您好",
    source_start: 0,
    source_end: 5,
  });
});

test("does not write when the review is rejected", async () => {
  const { run, writer } = executor();

  await expect(
    run(input, options, { status: "reject", reason: "语气不对" }),
  ).resolves.toEqual({
    type: "json",
    payload: {
      translated_string: "",
      status: "reject",
      reason: "语气不对",
    },
  });
  expect(writer).not.toHaveBeenCalled();
});

test("replaces only the unique source string", async () => {
  const { run, writer } = executor(vi.fn(async () => {}), async () => "before hello after");

  await run(input, options, { status: "approve" });

  expect(writer).toHaveBeenCalledWith({
    contents: "before 你好 after",
    file_path: filePath,
    translated_string: "你好",
    source_start: 7,
    source_end: 12,
  });
});

test("rejects a source string that is missing or not unique", async () => {
  const missing = executor(vi.fn(async () => {}), async () => "goodbye");
  const repeated = executor(vi.fn(async () => {}), async () => "hello hello");

  await expect(missing.run(input, options)).resolves.toEqual({
    type: "json",
    payload: {
      translated_string: "",
      status: "reject",
      reason: "src_string was not found in the file",
    },
  });
  await expect(repeated.run(input, options)).resolves.toEqual({
    type: "json",
    payload: {
      translated_string: "",
      status: "reject",
      reason: "src_string is not unique in the file",
    },
  });
  expect(missing.writer).not.toHaveBeenCalled();
  expect(repeated.writer).not.toHaveBeenCalled();
});

test("extracts memory before writing a refined translation", async () => {
  const order: string[] = [];
  const memory = {
    provideMemory: () => "",
    extractMemory: vi.fn(async () => {
      order.push("memory");
    }),
  };
  const writer = vi.fn(async () => {
    order.push("writer");
  });
  const run = createTranslateExecutor({ writer, read: async () => "hello" });

  await run(
    input,
    { ...options, memory },
    { status: "refined", refined_translated_string: "您好" },
  );

  expect(memory.extractMemory).toHaveBeenCalledWith({
    req: { tool: { name: "Translate", callId: "call-1" }, ...input },
    res: { status: "refined", refined_translated_string: "您好" },
  });
  expect(order).toEqual(["memory", "writer"]);
});

test("does not extract memory when the review is approved", async () => {
  const memory = {
    provideMemory: () => "",
    extractMemory: vi.fn(async () => {}),
  };
  const { run } = executor();

  await run(input, { ...options, memory }, { status: "approve" });

  expect(memory.extractMemory).not.toHaveBeenCalled();
});

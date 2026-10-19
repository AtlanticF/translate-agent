import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readTool, type ReadOutput } from "./read-tool.js";

const executeOptions = { toolCallId: "call-1", messages: [], context: {} };

test("reads lines from the start of a file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "read-tool-"));
  const filePath = join(directory, "note.txt");
  await writeFile(filePath, "alpha\nbeta\n");

  await expect(readTool.execute({ file_path: filePath }, executeOptions)).resolves.toEqual({
    lines: [
      { line: 1, text: "alpha" },
      { line: 2, text: "beta" },
    ],
  });
});

test("reads a window with offset and limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "read-tool-"));
  const filePath = join(directory, "note.txt");
  await writeFile(filePath, "one\ntwo\nthree\nfour\n");

  await expect(
    readTool.execute({ file_path: filePath, offset: 2, limit: 2 }, executeOptions),
  ).resolves.toEqual({
    lines: [
      { line: 2, text: "two" },
      { line: 3, text: "three" },
    ],
  });
});

test("reads at most 2000 lines and truncates long lines", async () => {
  const directory = await mkdtemp(join(tmpdir(), "read-tool-"));
  const filePath = join(directory, "long.txt");
  const lines = Array.from({ length: 2001 }, (_, index) =>
    index === 0 ? "a".repeat(2001) : `line-${index + 1}`,
  );
  await writeFile(filePath, lines.join("\n"));

  const result = (await readTool.execute(
    { file_path: filePath },
    executeOptions,
  )) as ReadOutput;

  expect(result.lines).toHaveLength(2000);
  expect(result.lines[0]).toEqual({ line: 1, text: "a".repeat(2000) });
  expect(result.lines[1999]).toEqual({ line: 2000, text: "line-2000" });
  expect(result.warning).toBeUndefined();
});

test("returns a warning when the file is empty", async () => {
  const directory = await mkdtemp(join(tmpdir(), "read-tool-"));
  const filePath = join(directory, "empty.txt");
  await writeFile(filePath, "");

  await expect(readTool.execute({ file_path: filePath }, executeOptions)).resolves.toEqual({
    lines: [],
    warning: "File exists but has no contents.",
  });
});

test("rejects a relative path", async () => {
  await expect(
    readTool.execute({ file_path: "note.txt" }, executeOptions),
  ).rejects.toThrow("file_path must be an absolute path");
});

test("returns an error when the file does not exist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "read-tool-"));
  const filePath = join(directory, "missing.txt");

  await expect(
    readTool.execute({ file_path: filePath }, executeOptions),
  ).rejects.toThrow(`File not found: ${filePath}`);
});

test("is the Read tool", () => {
  expect(readTool).toMatchObject({
    name: "Read",
    description: expect.stringContaining("absolute path"),
    inputSchema: expect.anything(),
    outputSchema: expect.anything(),
  });
});

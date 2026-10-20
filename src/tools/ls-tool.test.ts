import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { lsTool } from "./ls-tool.js";

test("lists files and directories in the given path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ls-tool-"));
  await writeFile(join(directory, "b.txt"), "b");
  await mkdir(join(directory, "a-dir"));

  await expect(
    lsTool.execute(
      { path: directory },
      { toolCallId: "call-1", messages: [], context: {} },
    ),
  ).resolves.toEqual([
    { name: "a-dir", type: "directory" },
    { name: "b.txt", type: "file" },
  ]);
});

test("rejects a relative path", async () => {
  await expect(
    lsTool.execute({ path: "notes" }, { toolCallId: "call-1", messages: [], context: {} }),
  ).rejects.toThrow("path must be an absolute path");
});

test("skips entries that match an ignore glob", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ls-tool-"));
  await writeFile(join(directory, "keep.txt"), "keep");
  await writeFile(join(directory, "notes.log"), "log");
  await mkdir(join(directory, "node_modules"));

  await expect(
    lsTool.execute(
      { path: directory, ignore: ["*.log", "**/node_modules/**"] },
      { toolCallId: "call-1", messages: [], context: {} },
    ),
  ).resolves.toEqual([{ name: "keep.txt", type: "file" }]);
});

test("rejects a path that is not a directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ls-tool-"));
  const filePath = join(directory, "note.txt");
  await writeFile(filePath, "note");

  await expect(
    lsTool.execute(
      { path: filePath },
      { toolCallId: "call-1", messages: [], context: {} },
    ),
  ).rejects.toThrow();
});

test("is the LS tool", () => {
  expect(lsTool).toMatchObject({
    name: "LS",
    description: expect.stringContaining("absolute path"),
    inputSchema: expect.objectContaining({
      jsonSchema: expect.objectContaining({
        additionalProperties: false,
        required: ["path"],
      }),
    }),
    outputSchema: expect.anything(),
  });
  expect(lsTool.description).toContain("ignore");
});

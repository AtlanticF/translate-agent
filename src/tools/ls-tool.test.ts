import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { lsTool } from "./ls-tool.js";

test("lists files and directories in the given path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ls-tool-"));
  await writeFile(join(directory, "b.txt"), "b");
  await mkdir(join(directory, "a-dir"));

  await expect(lsTool({ path: directory })).resolves.toEqual([
    { name: "a-dir", type: "directory" },
    { name: "b.txt", type: "file" },
  ]);
});

test("rejects a path that is not a directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ls-tool-"));
  const filePath = join(directory, "note.txt");
  await writeFile(filePath, "note");

  await expect(lsTool({ path: filePath })).rejects.toThrow();
});

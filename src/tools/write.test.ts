import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createWriteExecutor, writeExecutor, writeTool } from "./write.js";

const options = { name: "Write", callId: "call-1" };

test("writes UTF-8 text to a local absolute path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "write-tool-"));
  const filePath = join(directory, "article.md");

  const result = await writeExecutor({ file_path: filePath, content: "# 标题\n\n正文" }, options);

  expect(result).toEqual({ type: "json", payload: { file_path: filePath } });
  await expect(readFile(filePath, "utf8")).resolves.toBe("# 标题\n\n正文");
});

test("returns the actual path supplied by an injected writer", async () => {
  const writer = vi.fn(async () => ({ file_path: "/sessions/s/files/f/article.md" }));
  const execute = createWriteExecutor(writer);

  const result = await execute({ file_path: "/tmp/article.md", content: "# Article" }, options);

  expect(writer).toHaveBeenCalledWith({ file_path: "/tmp/article.md", content: "# Article" });
  expect(result).toEqual({
    type: "json",
    payload: { file_path: "/sessions/s/files/f/article.md" },
  });
});

test("rejects relative paths without calling the writer", async () => {
  const writer = vi.fn();
  const execute = createWriteExecutor(writer);

  await expect(execute({ file_path: "article.md", content: "text" }, options)).rejects.toThrow(
    "file_path must be an absolute path",
  );
  expect(writer).not.toHaveBeenCalled();
});

test("exposes the Write tool name", () => {
  expect(writeTool.name).toBe("Write");
});

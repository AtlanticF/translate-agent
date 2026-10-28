import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createLoop, createSession } from "./session.js";

test("shares one context with the loop", async () => {
  const { loop, context } = await createSession();
  const message = { role: "user" as const, content: "translate this" };

  await loop.userInput([message]);

  expect(context.getMessages()).toEqual([message]);
});

test("writes an approved translation to its file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "session-"));
  const filePath = join(directory, "note.txt");
  await writeFile(filePath, "before hello after");
  const { loop, context } = await createSession();

  context.addMessages([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "Translate",
          input: {
            file_path: filePath,
            src_string: "hello",
            translate_string: "你好",
          },
        },
      ],
    },
  ]);
  context.addCopilotResponses([{ status: "approve", tool: { callId: "call-1" } }]);

  const result = await loop.next();

  expect(result.copilotRequests).toEqual([]);
  await expect(readFile(filePath, "utf8")).resolves.toBe("before 你好 after");
});

test("routes LS tool calls through the injected directory reader", async () => {
  const seen: string[] = [];
  const loop = await createLoop(
    [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "LS",
            input: { path: "/.skills" },
          },
        ],
      },
    ],
    {
      ls: async (path) => {
        seen.push(path);
        return [{ name: "blog-translate", kind: "directory" }];
      },
    },
  );

  const result = await loop.next();

  expect(seen).toEqual(["/.skills"]);
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
            value: [{ name: "blog-translate", type: "directory" }],
          },
        },
      ],
    },
  ]);
});

test("appends an approved paragraph without changing the imported source", async () => {
  let source = "before hello after";
  const translated: string[] = [];
  const loop = await createLoop(
    [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "Translate",
            input: {
              file_path: "/sessions/s/files/f/note.txt",
              src_string: "hello",
              translate_string: "你好",
            },
          },
        ],
      },
    ],
    {
      read: async () => source,
      write: async ({ translated_string }) => {
        translated.push(translated_string);
      },
    },
  );
  loop.addCopilotResponses([{ status: "approve", tool: { callId: "call-1" } }]);

  await loop.next();

  expect(source).toBe("before hello after");
  expect(translated).toEqual(["你好"]);
});

test("routes Write through the injected file writer", async () => {
  let written: { file_path: string; content: string } | undefined;
  const loop = await createLoop(
    [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "Write",
            input: { file_path: "/tmp/article.md", content: "# Article" },
          },
        ],
      },
    ],
    {
      writeFile: async (input) => {
        written = input;
        return { file_path: "/sessions/s/files/f/article.md" };
      },
    },
  );

  const result = await loop.next();

  expect(written).toEqual({ file_path: "/tmp/article.md", content: "# Article" });
  expect(result.messages).toEqual([
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "Write",
          output: {
            type: "json",
            value: { file_path: "/sessions/s/files/f/article.md" },
          },
        },
      ],
    },
  ]);
});

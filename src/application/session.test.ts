import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createSession } from "./session.js";

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

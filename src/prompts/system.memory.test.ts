import { expect, test } from "vitest";
import { SYSTEM_MEMORY, type CopilotRequest } from "./system.memory.js";

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/file-1",
  tool: { name: "Translate", callId: "call-1" },
};

const currentMemory = '[{"index":0,"text":"keep","tags":["tone"]}]';

test("includes the source, translation, and current memory when the user approves", () => {
  const prompt = SYSTEM_MEMORY({
    req: request,
    res: { status: "approve" },
    currentMemory,
  });

  expect(prompt).toContain("You are a memory engine");
  expect(prompt).toContain("Status: approve");
  expect(prompt).toContain("File: /tmp/file-1");
  expect(prompt).toContain("Source: hello");
  expect(prompt).toContain("Translation: 你好");
  expect(prompt).toContain(currentMemory);
  expect(prompt).toContain('"index": -1');
  expect(prompt).toContain("Return strict JSON only, no commentary.");
  expect(prompt).not.toContain("//");
});

test("includes the source, translation, and reject reason", () => {
  const prompt = SYSTEM_MEMORY({
    req: request,
    res: { status: "reject", reason: "语气不对" },
    currentMemory,
  });

  expect(prompt).toContain("Status: reject");
  expect(prompt).toContain("Source: hello");
  expect(prompt).toContain("Translation: 你好");
  expect(prompt).toContain("User rejected the translation. Reason: 语气不对");
});

test("includes the source and the corrected translation", () => {
  const prompt = SYSTEM_MEMORY({
    req: request,
    res: { status: "refined", refined_translated_string: "您好" },
    currentMemory,
  });

  expect(prompt).toContain("Status: refined");
  expect(prompt).toContain("Source: hello");
  expect(prompt).toContain("Translation: 你好");
  expect(prompt).toContain("User corrected the translation.");
  expect(prompt).toContain("<to>\n您好\n</to>");
});

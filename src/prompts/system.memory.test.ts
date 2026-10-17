import { expect, test } from "vitest";
import { SYSTEM_MEMORY, type CopilotRequest } from "./system.memory.js";

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_id: "file-1",
};

const currentMemory = '[{"index":0,"text":"keep","tags":["tone"]}]';

test("includes the request and current memory when the user approves", () => {
  const prompt = SYSTEM_MEMORY({
    req: request,
    res: { status: "approve" },
    currentMemory,
  });

  expect(prompt).toContain("hello");
  expect(prompt).toContain("你好");
  expect(prompt).toContain("file-1");
  expect(prompt).toContain(currentMemory);
  expect(prompt).toContain("approve");
  expect(prompt).toContain('"ops"');
});

test("includes the reject reason", () => {
  const prompt = SYSTEM_MEMORY({
    req: request,
    res: { status: "reject", reason: "语气不对" },
    currentMemory,
  });

  expect(prompt).toContain("reject");
  expect(prompt).toContain("语气不对");
});

test("includes the refined translation", () => {
  const prompt = SYSTEM_MEMORY({
    req: request,
    res: { status: "refined", refined_translated_string: "您好" },
    currentMemory,
  });

  expect(prompt).toContain("refined");
  expect(prompt).toContain("您好");
});

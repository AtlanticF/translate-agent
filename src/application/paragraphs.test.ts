import { expect, test } from "vitest";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { rememberReview, visibleParagraphs, type Paragraph } from "./paragraphs.js";

const done: Paragraph = {
  id: "call-0",
  src: "你好",
  translation: "hello",
  status: "done",
};

const current: CopilotRequest = {
  src_string: "hello world",
  translate_string: "你好世界",
  file_path: "/tmp/note.txt",
  tool: { name: "Translate", callId: "call-1" },
};

const upcoming: CopilotRequest = {
  ...current,
  src_string: "next paragraph",
  translate_string: "下一段",
  tool: { name: "Translate", callId: "call-2" },
};

test("marks only the first remaining paragraph as current", () => {
  expect(visibleParagraphs([done], [current, upcoming])).toEqual([
    done,
    {
      id: "call-1",
      src: "hello world",
      translation: "你好世界",
      status: "current",
    },
    {
      id: "call-2",
      src: "next paragraph",
      translation: "…",
      status: "pending",
    },
  ]);
});

test("keeps approved and refined paragraphs and skips a rejection", () => {
  expect(
    rememberReview(
      [],
      [current, upcoming],
      [
        { status: "approve", tool: { callId: "call-1" } },
        { status: "reject", reason: "语气不对", tool: { callId: "call-2" } },
      ],
    ),
  ).toEqual([
    {
      id: "call-1",
      src: "hello world",
      translation: "你好世界",
      status: "done",
    },
  ]);
});

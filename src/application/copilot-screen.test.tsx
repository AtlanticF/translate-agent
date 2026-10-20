import { renderToString } from "ink";
import { expect, test } from "vitest";
import type { CopilotRequest } from "../prompts/system.memory.js";
import {
  copilotKey,
  CopilotScreen,
  rejectReasonHint,
  reviewProgress,
  submittedReason,
  submittedRefinement,
} from "./copilot-screen.js";

const first: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/note.txt",
  tool: { name: "Translate", callId: "call-1" },
};

const second: CopilotRequest = {
  ...first,
  src_string: "world",
  tool: { name: "Translate", callId: "call-2" },
};

test("shows the current review and the choice keys", () => {
  const output = renderToString(
    <CopilotScreen requests={[first, second]} onSubmit={() => {}} />,
  );

  expect(output).toContain("hello");
  expect(output).toContain("你好");
  expect(output).not.toContain("world");
  expect(output).not.toContain("原文");
  expect(output).not.toContain("译文");
  expect(output).not.toContain("已完成");
  expect(output).not.toContain("当前");
  expect(output).toContain("通过");
  expect(output).toContain("拒绝");
  expect(output).toContain("修改");
  expect(output).toContain("0%");
  expect(output).toContain("剩余 2");
});

test("shows an empty state when nothing is waiting", () => {
  const output = renderToString(<CopilotScreen requests={[]} onSubmit={() => {}} />);

  expect(output).toContain("没有待审核的译文");
});

test("maps review keys and ignores a blank reason", () => {
  expect(copilotKey("a")).toBe("approve");
  expect(copilotKey("r")).toBe("reject");
  expect(copilotKey("f")).toBe("refine");
  expect(copilotKey("x")).toBeUndefined();
  expect(submittedReason("  \n")).toBeUndefined();
  expect(submittedReason(" 太直译 \n")).toBe("太直译");
  expect(submittedReason(`${rejectReasonHint}\n`)).toBeUndefined();
  expect(submittedReason(`${rejectReasonHint}\n语气不对\n`)).toBe("语气不对");
  expect(submittedRefinement(" \n")).toBeUndefined();
  expect(submittedRefinement("您好\n")).toBe("您好\n");
  expect(reviewProgress(1, 3, 1)).toEqual({ percent: 50, remaining: 2 });
});

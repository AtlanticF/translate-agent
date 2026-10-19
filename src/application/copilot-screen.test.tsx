import { renderToString } from "ink";
import { expect, test } from "vitest";
import type { CopilotRequest } from "../prompts/system.memory.js";
import {
  copilotKey,
  CopilotScreen,
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

  expect(output).toContain("审核 1/2");
  expect(output).toContain("文件: /tmp/note.txt");
  expect(output).toContain("原文: hello");
  expect(output).toContain("草稿: 你好");
  expect(output).toContain("a 通过    r 拒绝    f 修改");
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
  expect(submittedRefinement(" \n")).toBeUndefined();
  expect(submittedRefinement("您好\n")).toBe("您好\n");
});

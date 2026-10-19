import { renderToString } from "ink";
import { expect, test } from "vitest";
import type { Paragraph } from "./paragraphs.js";
import { SourcePane, TranslationPane } from "./review-panes.js";

const paragraphs: Paragraph[] = [
  { id: "done", src: "你好", translation: "hello", status: "done" },
  { id: "current", src: "hello world", translation: "你好世界", status: "current" },
  { id: "pending", src: "next paragraph", translation: "…", status: "pending" },
];

test("shows the source of every step and frames only the current one", () => {
  const output = renderToString(<SourcePane paragraphs={paragraphs} />);

  expect(output).toContain("原文");
  expect(output).toContain("你好");
  expect(output).toContain("hello world");
  expect(output).toContain("next paragraph");
  expect(output).toContain("╭");
  expect(output.split("╭")).toHaveLength(2);
});

test("shows translation progress beside each step", () => {
  const output = renderToString(<TranslationPane paragraphs={paragraphs} />);

  expect(output).toContain("译文");
  expect(output).toContain("hello");
  expect(output).toContain("已完成");
  expect(output).toContain("你好世界");
  expect(output).toContain("当前");
  expect(output).toContain("…");
  expect(output).toContain("未开始");
  expect(output.split("╭")).toHaveLength(2);
});

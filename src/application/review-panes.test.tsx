import { renderToString } from "ink";
import { expect, test } from "vitest";
import { ReviewColumns } from "./review-panes.js";

test("places the source and translation in one aligned row", () => {
  const output = renderToString(
    <ReviewColumns source="hello world" translation="你好世界" direction="row" />,
  );

  expect(output).toContain("hello world");
  expect(output).toContain("你好世界");
  expect(output).not.toContain("原文");
  expect(output).not.toContain("译文");
  expect(output).not.toContain("当前");
});

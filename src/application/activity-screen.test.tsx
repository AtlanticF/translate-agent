import { renderToString } from "ink";
import { expect, test } from "vitest";
import { ActivityScreen } from "./activity-screen.js";

test("shows completed steps and the current wait", () => {
  const output = renderToString(
    <ActivityScreen
      items={[
        { variant: "info", text: "调用 LS" },
        { variant: "success", text: "LS 完成" },
      ]}
      waiting="正在思考"
    />,
  );

  expect(output).toContain("调用 LS");
  expect(output).toContain("LS 完成");
  expect(output).toContain("正在思考");
});

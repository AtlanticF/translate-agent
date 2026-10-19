import { renderToString } from "ink";
import { expect, test } from "vitest";
import { appName, inputPlaceholder, submittedUserText, UserScreen, welcome } from "./user-screen.js";

test("shows a welcome and a bordered input when the conversation is empty", () => {
  const output = renderToString(<UserScreen messages={[]} onSubmit={() => {}} />);

  expect(output).toContain(appName);
  expect(output).toContain(welcome);
  expect(output).toContain("LS         列出目录");
  expect(output).toContain("Read       读取文件");
  expect(output).toContain("Translate  提交一段译文");
  expect(output).toContain(inputPlaceholder);
  expect(output).toContain("╭");
});

test("shows messages and the input", () => {
  const output = renderToString(
    <UserScreen
      messages={[
        { role: "user", content: "translate README" },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "Translate",
              input: {},
            },
          ],
        },
      ]}
      onSubmit={() => {}}
    />,
  );

  expect(output).toContain("用户 translate README");
  expect(output).toContain("助手 Translate");
  expect(output).toContain(inputPlaceholder);
  expect(output).not.toContain(welcome);
});

test("drops a blank user message", () => {
  expect(submittedUserText("  \n")).toBeUndefined();
  expect(submittedUserText(" 你好 \n")).toBe("你好");
});

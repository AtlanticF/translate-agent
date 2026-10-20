import { renderToString } from "ink";
import { expect, test } from "vitest";
import {
  exampleHeading,
  examplePrompts,
  inputPlaceholder,
  submittedUserText,
  UserScreen,
  welcomeDescription,
  welcomeHint,
  welcomeTitle,
} from "./user-screen.js";

test("shows a welcome and a bordered input when the conversation is empty", () => {
  const output = renderToString(<UserScreen messages={[]} onSubmit={() => {}} />);

  expect(output).toContain(welcomeTitle);
  expect(output).not.toContain("▝▜▙");
  for (const line of welcomeDescription) {
    expect(output).toContain(line);
  }
  expect(output).toContain(exampleHeading);
  expect(output).toContain(`1. "${examplePrompts[0]}"`);
  expect(output).toContain(`2. "${examplePrompts[1]}"`);
  expect(output).toContain(welcomeHint);
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

  expect(output).toContain("user:");
  expect(output).toContain("translate README");
  expect(output).not.toContain("assistant:");
  expect(output).toContain(inputPlaceholder);
  expect(output).not.toContain(welcomeTitle);
});

test("lists the commands when the input starts with a slash", () => {
  const output = renderToString(
    <UserScreen messages={[]} initialValue="/" onSubmit={() => {}} />,
  );

  expect(output).toContain("/exit  Exit");
  expect(output).toContain("/compact  Compact the conversation");
  expect(output).toContain("/memory  Show stored memory");
  expect(output.indexOf("/exit")).toBeGreaterThan(output.indexOf("╭"));
});

test("drops a blank user message", () => {
  expect(submittedUserText("  \n")).toBeUndefined();
  expect(submittedUserText(" 你好 \n")).toBe("你好");
});

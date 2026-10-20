import { renderToString } from "ink";
import { expect, test } from "vitest";
import { MemoryScreen, memoryLine } from "./memory-screen.js";

test("puts text and style on one line", () => {
  expect(memoryLine({ text: "Use 您.", tags: ["style"] })).toBe("Use 您.  style");
  expect(memoryLine({ text: "Keep names.", tags: ["style", "terminology"] })).toBe(
    "Keep names.  style, terminology",
  );
  expect(memoryLine({ text: "Plain.", tags: [] })).toBe("Plain.");
});

test("lists stored memory one item per line", () => {
  const output = renderToString(
    <MemoryScreen
      messages={[{ role: "user", content: "translate README" }]}
      items={[
        { text: "Use 您.", tags: ["style"] },
        { text: "Keep names.", tags: ["terminology"] },
      ]}
      onSubmit={() => {}}
    />,
  );

  expect(output).toContain("translate README");
  expect(output).toContain("memory");
  expect(output).toContain("Use 您.  style");
  expect(output).toContain("Keep names.  terminology");
});

test("says there is no memory when the list is empty", () => {
  const output = renderToString(
    <MemoryScreen messages={[]} items={[]} onSubmit={() => {}} />,
  );

  expect(output).toContain("No memory.");
});

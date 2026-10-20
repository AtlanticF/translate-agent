import { renderToString } from "ink";
import { expect, test } from "vitest";
import { CompactScreen, compactingLabel } from "./compact-screen.js";

const messages = [{ role: "user" as const, content: "translate README" }];

test("shows a compacting state while the summary is running", () => {
  const output = renderToString(<CompactScreen messages={messages} />);

  expect(output).toContain("user:");
  expect(output).toContain("translate README");
  expect(output).toContain(compactingLabel);
  expect(output).toContain("╭");
  expect(output).not.toContain("analysis");
});

test("shows the analysis and summary when compact finishes", () => {
  const output = renderToString(
    <CompactScreen
      messages={messages}
      result={{ analysis: "Dropped the old drafts.", summary: "User wants Chinese." }}
      onSubmit={() => {}}
    />,
  );

  expect(output).toContain("analysis");
  expect(output).toContain("Dropped the old drafts.");
  expect(output).toContain("summary");
  expect(output).toContain("User wants Chinese.");
  expect(output).not.toContain(compactingLabel);
});

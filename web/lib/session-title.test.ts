import { expect, test } from "vitest";
import { sessionTitle } from "./session-title";

test("uses the first user line as the session title", () => {
  expect(
    sessionTitle([
      { role: "assistant", content: "hello" },
      { role: "user", content: "  Translate the readme  " },
    ]),
  ).toBe("Translate the readme");
});

test("shortens a long title", () => {
  expect(sessionTitle([{ role: "user", content: "a".repeat(60) }])).toBe(`${"a".repeat(48)}…`);
});

test("falls back when the session has no user text", () => {
  expect(sessionTitle([])).toBe("New session");
});

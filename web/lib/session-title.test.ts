import { expect, test } from "vitest";
import { displaySessionTitle, readSessionTitle, sessionTitle } from "./session-title";

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

test("prefers a custom title and falls back when it is cleared", () => {
  const messages = [{ role: "user" as const, content: "Translate the readme" }];
  expect(displaySessionTitle({ title: "  项目说明  ", messages })).toBe("项目说明");
  expect(displaySessionTitle({ title: null, messages })).toBe("Translate the readme");
  expect(displaySessionTitle({ title: "   ", messages })).toBe("Translate the readme");
});

test("accepts a trimmed title and rejects one that is too long", () => {
  expect(readSessionTitle("  Weekly notes  ")).toEqual({ ok: true, title: "Weekly notes" });
  expect(readSessionTitle("   ")).toEqual({ ok: true, title: null });
  expect(readSessionTitle(null)).toEqual({ ok: true, title: null });
  expect(readSessionTitle(12)).toEqual({ ok: false, error: "title must be a string" });
  expect(readSessionTitle("a".repeat(81)).ok).toBe(false);
});

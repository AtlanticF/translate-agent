import { expect, test } from "vitest";
import {
  omitDoneFilePaths,
  resumeMarker,
  visibleUserText,
  withImportedFiles,
  withoutImportedFiles,
} from "./imported-files";

test("withImportedFiles appends only the path list when there is no resume info", () => {
  expect(withImportedFiles("继续", ["/sessions/s/files/a/b.md"])).toBe(
    "继续\n\nImported files:\n/sessions/s/files/a/b.md",
  );
  expect(withImportedFiles("继续", [])).toBe("继续");
});

test("withImportedFiles appends the resume hint when provided", () => {
  const content = withImportedFiles("继续", ["/sessions/s/files/a/b.md"], {
    line: 7,
    excerpt: "para two",
  });

  expect(content).toContain("Imported files:\n/sessions/s/files/a/b.md");
  expect(content).toContain(`${resumeMarker} line 7 starts with "para two"`);
  expect(content).toContain("do not translate them again");
});

test("omitDoneFilePaths also strips stale resume hints", () => {
  const messages = [
    {
      role: "user",
      content: withImportedFiles("继续", ["/sessions/s/files/a/b.md"], { line: 7, excerpt: "para" }),
    },
  ];

  const next = omitDoneFilePaths(messages, ["/sessions/s/files/a/b.md"]);

  expect(next[0].content).toBe("继续");
});

test("withoutImportedFiles keeps messages without markers intact", () => {
  expect(withoutImportedFiles("plain text", new Set(["/a"]))).toBe("plain text");
  expect(visibleUserText("继续\n\nImported files:\n/a")).toBe("继续");
});

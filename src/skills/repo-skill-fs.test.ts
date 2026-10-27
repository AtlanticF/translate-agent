import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { collectSkillsIndex } from "../../scripts/sync-skills-index.mjs";
import {
  buildSkillsPrompt,
  createRepoSkillFs,
  loadSkills,
  parseRepoSkillsIndex,
} from "./index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const index = collectSkillsIndex(repoRoot);

function realFs() {
  return createRepoSkillFs(index, (virtualPath) =>
    readFile(path.join(repoRoot, virtualPath.slice(1)), "utf8"),
  );
}

test("joins, splits, and names POSIX paths", () => {
  const fs = realFs();

  expect(fs.join("/.skills", "blog-translate", "SKILL.md")).toBe(
    "/.skills/blog-translate/SKILL.md",
  );
  expect(fs.join("/.skills", "a", "..", "b")).toBe("/.skills/b");
  expect(fs.join("/.skills", "..", "escape.md")).toBe("/escape.md");
  expect(fs.dirname("/.skills/blog-translate/SKILL.md")).toBe("/.skills/blog-translate");
  expect(fs.dirname("/.skills")).toBe("/");
  expect(fs.basename("/.skills/blog-translate/SKILL.md")).toBe("SKILL.md");
  expect(fs.basename("/.skills/blog-translate/")).toBe("blog-translate");
});

test("derives directories and entries from the index", async () => {
  const fs = realFs();

  await expect(fs.readDir("/.skills")).resolves.toEqual([
    { name: "blog-translate", kind: "directory" },
  ]);
  const entries = await fs.readDir("/.skills/blog-translate");
  expect(entries.map((entry) => entry.name)).toEqual(
    [...entries.map((entry) => entry.name)].sort((left, right) => left.localeCompare(right)),
  );
  expect(entries).toEqual(
    expect.arrayContaining([
      { name: "references", kind: "directory" },
      { name: "SKILL.md", kind: "file" },
    ]),
  );
  await expect(fs.readDir("/.skills/blog-translate/references")).resolves.toHaveLength(2);

  await expect(fs.readDir("/.skills/blog-translate/SKILL.md")).rejects.toThrow(
    "Directory not found",
  );
  await expect(fs.readDir("/.skills/unknown")).rejects.toThrow("Directory not found");
});

test("checks existence from files and directory prefixes", async () => {
  const fs = realFs();

  await expect(fs.exists("/.skills")).resolves.toBe(true);
  await expect(fs.exists("/.skills/blog-translate")).resolves.toBe(true);
  await expect(fs.exists("/.skills/blog-translate/references")).resolves.toBe(true);
  await expect(fs.exists("/.skills/blog-translate/SKILL.md")).resolves.toBe(true);
  await expect(fs.exists("/.skills/blog-translate/references/deeper")).resolves.toBe(false);
  await expect(fs.exists("/.skills/blog-translate/missing.md")).resolves.toBe(false);
  await expect(fs.exists("/.skills/../escape")).resolves.toBe(false);
  await expect(fs.exists(".skills/blog-translate")).resolves.toBe(false);
});

test("reads only indexed files by virtual path", async () => {
  const fs = createRepoSkillFs(
    { root: "/.skills", files: ["/.skills/blog-translate/SKILL.md"] },
    async (virtualPath) => virtualPath,
  );

  await expect(fs.readFile("/.skills/blog-translate/SKILL.md")).resolves.toBe(
    "/.skills/blog-translate/SKILL.md",
  );
  await expect(
    fs.readFile("/.skills/blog-translate/references/translation-rules.md"),
  ).rejects.toThrow("File not found");
  await expect(fs.readFile("/.skills/blog-translate/../blog-translate/SKILL.md")).rejects.toThrow(
    "File not found",
  );
  await expect(fs.readFile("/.skills\\blog-translate\\SKILL.md")).rejects.toThrow(
    "File not found",
  );
  await expect(fs.readFile("/sessions/s/files/f/note.txt")).rejects.toThrow("File not found");
});

test("rejects malformed indexes", () => {
  expect(() => parseRepoSkillsIndex(null)).toThrow("must be an object");
  expect(() => parseRepoSkillsIndex({ root: "skills", files: [] })).toThrow(
    "root must be an absolute path",
  );
  expect(() =>
    parseRepoSkillsIndex({ root: "/.skills", files: ["/.other/SKILL.md"] }),
  ).toThrow("outside /.skills");
  expect(() =>
    parseRepoSkillsIndex({
      root: "/.skills",
      files: ["/.skills/a/SKILL.md", "/.skills/a/SKILL.md"],
    }),
  ).toThrow("duplicate");
  expect(() =>
    parseRepoSkillsIndex({ root: "/.skills", files: ["/.skills/a\\SKILL.md"] }),
  ).toThrow("outside /.skills");
});

test("loads the committed skill through the real index", async () => {
  const fs = realFs();
  const catalog = await loadSkills(fs, [{ path: "/.skills", precedence: 0 }]);

  expect([...catalog.skills.keys()]).toContain("blog-translate");
  expect(catalog.diagnostics).toEqual([]);
  const prompt = buildSkillsPrompt([...catalog.skills.values()]);
  expect(prompt).toContain("blog-translate");
  expect(prompt).toContain("/.skills/blog-translate/SKILL.md");
});

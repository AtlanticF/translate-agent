import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { isSkillsPath, loadWebSkills } from "./skills";
import { loadRepoSkills } from "./skills-repo";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const skill = `---
name: demo-skill
description: Demo skill used by tests.
---

# Demo
`;

test("loads skills from the bundle", async () => {
  const skills = await loadWebSkills({
    root: "/.skills",
    files: {
      "/.skills/demo-skill/SKILL.md": skill,
      "/.skills/demo-skill/references/rules.md": "rules",
    },
  });

  expect(skills.diagnostics).toEqual([]);
  expect(skills.prompt).toContain("demo-skill");
  expect(skills.prompt).toContain("/.skills/demo-skill/SKILL.md");
  await expect(skills.fs.readFile("/.skills/demo-skill/references/rules.md")).resolves.toBe(
    "rules",
  );
});

test("loads skills from the repository for local tooling", async () => {
  const skills = await loadRepoSkills(repoRoot);

  expect(skills.prompt).toContain("blog-translate");
  expect(skills.prompt).toContain("/.skills/blog-translate/SKILL.md");
  await expect(skills.fs.readFile("/.skills/blog-translate/SKILL.md")).resolves.toContain(
    "blog-translate",
  );
});

test("recognizes skill paths", () => {
  expect(isSkillsPath("/.skills")).toBe(true);
  expect(isSkillsPath("/.skills/blog-translate/SKILL.md")).toBe(true);
  expect(isSkillsPath("/.skillful/x")).toBe(false);
  expect(isSkillsPath("/sessions/s/files/f/a.txt")).toBe(false);
});

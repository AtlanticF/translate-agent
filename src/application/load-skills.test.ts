import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { SYSTEM_WORKFLOW } from "../prompts/system.workflow.js";
import { loadProjectSkills, projectSkillsDirectory } from "./load-skills.js";

test("loads skills from the .skills directory of the working directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-"));
  const skillDir = join(cwd, projectSkillsDirectory, "pdf-processing");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---
name: pdf-processing
description: Extract PDF text.
---

# PDF
`,
  );
  await mkdir(join(cwd, projectSkillsDirectory, "node_modules", "pkg"), { recursive: true });
  await writeFile(
    join(cwd, projectSkillsDirectory, "node_modules", "pkg", "SKILL.md"),
    `---
name: pkg
description: Ignore me.
---
`,
  );

  const loaded = await loadProjectSkills(cwd);
  const prompt = SYSTEM_WORKFLOW({ currentMemory: "", skillsPrompt: loaded.prompt });

  expect(loaded.diagnostics).toEqual([]);
  expect(loaded.prompt).toContain("<name>pdf-processing</name>");
  expect(loaded.prompt).toContain(join(skillDir, "SKILL.md"));
  expect(loaded.prompt).not.toContain("<name>pkg</name>");
  expect(prompt).toContain("# Skills");
  expect(prompt).toContain("pdf-processing");
  expect(prompt).toContain("Skill Activation and Loading Policy");
});

test("returns an empty prompt when the working directory has no .skills directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skills-empty-"));

  const loaded = await loadProjectSkills(cwd);

  expect(loaded.prompt).toBe("");
  expect(loaded.diagnostics).toEqual([]);
});

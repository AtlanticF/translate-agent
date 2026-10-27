import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import {
  checkSkillsIndex,
  collectSkillsIndex,
  renderSkillsIndex,
} from "../../scripts/sync-skills-index.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const committedIndexPath = path.join(repoRoot, "src/skills/repo-index.json");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("committed index matches the .skills directory", async () => {
  const committed = await readFile(committedIndexPath, "utf8");
  const expected = collectSkillsIndex(repoRoot);

  expect(expected.root).toBe("/.skills");
  expect(JSON.parse(committed)).toEqual(expected);
  expect(committed).toBe(renderSkillsIndex(expected));

  for (const file of expected.files) {
    expect(file.startsWith("/.skills/")).toBe(true);
    await expect(readFile(path.join(repoRoot, file.slice(1)), "utf8")).resolves.toBeTypeOf(
      "string",
    );
  }
});

test("checkSkillsIndex rejects missing, extra, stale, and unsorted indexes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skills-index-"));
  tempRoots.push(root);

  const skillFile = path.join(root, ".skills/blog-translate/SKILL.md");
  const reference = path.join(root, ".skills/blog-translate/references/rules.md");
  await mkdir(path.dirname(reference), { recursive: true });
  await writeFile(skillFile, "skill");
  await writeFile(reference, "rules");

  expect(checkSkillsIndex(root, "index.json")).toBe(false);

  const index = collectSkillsIndex(root);
  await writeFile(path.join(root, "index.json"), renderSkillsIndex(index));
  expect(checkSkillsIndex(root, "index.json")).toBe(true);

  await writeFile(
    path.join(root, "index.json"),
    `${JSON.stringify({ ...index, files: [...index.files].reverse() }, null, 2)}\n`,
  );
  expect(checkSkillsIndex(root, "index.json")).toBe(false);

  await writeFile(path.join(root, "index.json"), renderSkillsIndex(index));
  const extra = path.join(root, ".skills/blog-translate/references/extra.md");
  await mkdir(path.dirname(extra), { recursive: true });
  await writeFile(extra, "extra");
  expect(checkSkillsIndex(root, "index.json")).toBe(false);

  await writeFile(path.join(root, "index.json"), renderSkillsIndex(collectSkillsIndex(root)));
  await rm(skillFile);
  expect(checkSkillsIndex(root, "index.json")).toBe(false);
});

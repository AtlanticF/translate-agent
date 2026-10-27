import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSkillsPrompt,
  createRepoSkillFs,
  loadSkills,
  parseRepoSkillsIndex,
  type SkillFs,
} from "../../src/skills/index.js";
import type { LoadedSkills } from "./skills";

const indexRelativePath = "src/skills/repo-index.json";
const skillsDirectory = ".skills";

export function findRepoRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (true) {
    if (
      existsSync(path.join(current, indexRelativePath)) &&
      existsSync(path.join(current, skillsDirectory))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("无法找到仓库根目录");
    }
    current = parent;
  }
}

export async function createRepoSkillFsFromRepo(repoRoot = findRepoRoot()): Promise<SkillFs> {
  const root = path.resolve(repoRoot);
  const index = parseRepoSkillsIndex(
    JSON.parse(await readFile(path.join(root, indexRelativePath), "utf8")),
  );
  const skillsRoot = path.resolve(root, skillsDirectory);

  return createRepoSkillFs(index, async (virtualPath) => {
    const relative = virtualPath.slice(index.root.length + 1);
    const absolute = path.resolve(skillsRoot, relative);
    if (!absolute.startsWith(`${skillsRoot}${path.sep}`)) {
      throw new Error(`File not found: ${virtualPath}`);
    }
    return readFile(absolute, "utf8");
  });
}

export async function loadRepoSkills(repoRoot = findRepoRoot()): Promise<LoadedSkills> {
  const fs = await createRepoSkillFsFromRepo(repoRoot);
  const catalog = await loadSkills(fs, [{ path: "/.skills", precedence: 0 }]);
  return {
    fs,
    prompt: buildSkillsPrompt([...catalog.skills.values()]),
    diagnostics: catalog.diagnostics,
  };
}

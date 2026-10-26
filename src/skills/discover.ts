import { SCAN_MAX_DEPTH, SCAN_MAX_DIRECTORIES, SKIP_DIRECTORY_NAMES, SKILL_FILENAME } from "./constants.js";
import type { SkillDiagnostic } from "./diagnostics.js";
import type { SkillDirEntry, SkillFs } from "./fs.js";

/**
 * 一个 skills 根目录。
 * precedence 越大越优先。同优先级保留先发现的。
 * 同名覆盖发生在收集阶段，并记一条 name-collision。
 */
export type SkillRoot = {
  path: string;
  precedence: number;
};

/** 一处 SKILL.md。parentName 是它所在目录的名字。 */
export type DiscoveredSkill = {
  location: string;
  parentName: string;
  rootPath: string;
  precedence: number;
};

export type DiscoverSkillsResult = {
  skills: readonly DiscoveredSkill[];
  diagnostics: readonly SkillDiagnostic[];
};

/**
 * 扫描各个 root，找出子目录中的 SKILL.md。
 *
 * - 只把子目录里的 SKILL.md 当成 skill，根目录上的 README.md 或其他文件忽略
 * - 找到 SKILL.md 后不再进入该目录
 * - 根目录不存在则跳过
 * - 碰到 SCAN_MAX_DEPTH 或 SCAN_MAX_DIRECTORIES 时返回已找到的，并记 scan-truncated
 * - 不进入 SKIP_DIRECTORY_NAMES 中的目录
 */
export type DiscoverSkills = (
  fs: SkillFs,
  roots: readonly SkillRoot[],
) => Promise<DiscoverSkillsResult>;

const skipDirectories = new Set<string>(SKIP_DIRECTORY_NAMES);

export const discoverSkills: DiscoverSkills = async (fs, roots) => {
  const skills: DiscoveredSkill[] = [];
  const diagnostics: SkillDiagnostic[] = [];
  let visited = 0;
  let truncated = false;

  for (const root of roots) {
    if (truncated) break;
    if (!(await fs.exists(root.path))) continue;
    await walk(root, root.path, 0);
  }

  return { skills, diagnostics };

  async function walk(root: SkillRoot, dir: string, depth: number): Promise<void> {
    if (truncated) return;
    visited += 1;
    if (visited > SCAN_MAX_DIRECTORIES) {
      noteTruncation(dir);
      return;
    }

    if (depth > 0 && (await fs.exists(fs.join(dir, SKILL_FILENAME)))) {
      skills.push({
        location: fs.join(dir, SKILL_FILENAME),
        parentName: fs.basename(dir),
        rootPath: root.path,
        precedence: root.precedence,
      });
      return;
    }

    let entries: readonly SkillDirEntry[] = [];
    try {
      entries = await fs.readDir(dir);
    } catch {
      return;
    }
    const children = entries
      .filter((entry) => entry.kind === "directory" && !skipDirectories.has(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));

    if (depth >= SCAN_MAX_DEPTH) {
      if (children.length > 0) noteTruncation(dir);
      return;
    }

    for (const child of children) {
      await walk(root, fs.join(dir, child.name), depth + 1);
      if (truncated) return;
    }
  }

  function noteTruncation(location: string): void {
    if (truncated) return;
    truncated = true;
    diagnostics.push({
      level: "warn",
      code: "scan-truncated",
      message: "扫描达到深度或目录数量上限",
      location,
    });
  }
};

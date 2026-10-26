import type { SkillDiagnostic } from "./diagnostics.js";
import type { SkillFs } from "./fs.js";

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

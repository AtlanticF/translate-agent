import type { SkillDiagnostic } from "./diagnostics.js";
import type { SkillRoot } from "./discover.js";
import type { SkillFs } from "./fs.js";

/**
 * 收集后按 name 保存的记录。
 * body 不在这里；base directory 以后用 dirname(location) 推导。
 */
export type SkillRecord = {
  name: string;
  description: string;
  location: string;
  license?: string;
  compatibility?: string;
  metadata?: Readonly<Record<string, string>>;
  allowedTools?: string;
};

/** skills 以 name 为键。diagnostics 包含警告和被跳过的错误。 */
export type SkillCatalog = {
  skills: ReadonlyMap<string, SkillRecord>;
  diagnostics: readonly SkillDiagnostic[];
};

/**
 * 发现、解析、校验后按 name 收集。
 * precedence 越大越优先；同优先级保留先发现的。
 * 同名覆盖时记 name-collision，保留胜出的那条。
 */
export type LoadSkills = (
  fs: SkillFs,
  roots: readonly SkillRoot[],
) => Promise<SkillCatalog>;

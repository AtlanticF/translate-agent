import type { SkillDiagnostic } from "./diagnostics.js";
import { discoverSkills, type SkillRoot } from "./discover.js";
import type { SkillFs } from "./fs.js";
import { parseSkill } from "./parse.js";
import { validateSkill } from "./validator.js";

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

export const loadSkills: LoadSkills = async (fs, roots) => {
  const discovered = await discoverSkills(fs, roots);
  const diagnostics = [...discovered.diagnostics];
  const chosen = new Map<string, { record: SkillRecord; precedence: number }>();

  for (const found of discovered.skills) {
    let content: string;
    try {
      content = await fs.readFile(found.location);
    } catch {
      diagnostics.push({
        level: "error",
        code: "yaml-unparseable",
        message: "无法读取 SKILL.md",
        location: found.location,
      });
      continue;
    }

    const parsed = parseSkill({
      content,
      location: found.location,
      parentName: found.parentName,
    });
    if (!parsed.ok) {
      diagnostics.push(parsed.diagnostic);
      continue;
    }

    const validated = validateSkill(parsed.skill);
    diagnostics.push(...validated.diagnostics);
    if (validated.status === "skip") continue;

    const current = chosen.get(validated.skill.name);
    if (!current) {
      chosen.set(validated.skill.name, {
        record: validated.skill,
        precedence: found.precedence,
      });
      continue;
    }

    diagnostics.push({
      level: "warn",
      code: "name-collision",
      message: `同名 skill「${validated.skill.name}」保留优先级更高或更早发现的一条`,
      location: found.location,
    });
    if (found.precedence > current.precedence) {
      chosen.set(validated.skill.name, {
        record: validated.skill,
        precedence: found.precedence,
      });
    }
  }

  return {
    skills: new Map([...chosen].map(([name, item]) => [name, item.record])),
    diagnostics,
  };
};

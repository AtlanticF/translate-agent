import type { SkillRecord } from "./catalog.js";
import type { SkillDiagnostic } from "./diagnostics.js";
import type { ParsedSkill } from "./parse.js";

export type ValidationResult =
  | {
      status: "load";
      skill: SkillRecord;
      diagnostics: readonly SkillDiagnostic[];
    }
  | {
      status: "skip";
      diagnostics: readonly SkillDiagnostic[];
    };

/**
 * 按 LENIENT_RULES 校验一条已解析的 skill。
 *
 * error 才跳过，warn 仍加载。目录名不能代替缺失的 name。
 * description 或 compatibility 超长时保留原文。
 * metadata 不是字符串到字符串的映射时丢掉 metadata，其余字段仍加载。
 */
export type ValidateSkill = (skill: ParsedSkill) => ValidationResult;

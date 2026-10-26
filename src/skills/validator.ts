import type { SkillRecord } from "./catalog.js";
import {
  COMPATIBILITY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "./constants.js";
import type { SkillDiagnostic, SkillDiagnosticCode } from "./diagnostics.js";
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

const nameCharset = /^[a-z0-9-]+$/;

export const validateSkill: ValidateSkill = (skill) => {
  const { frontmatter, location, parentName } = skill;
  const name = frontmatter.name ?? "";
  const description = frontmatter.description ?? "";
  if (name.trim() === "") {
    return skip(location, "name-missing", "frontmatter 缺少 name");
  }
  if (description.trim() === "") {
    return skip(location, "description-missing", "frontmatter 缺少 description");
  }

  const diagnostics: SkillDiagnostic[] = [];
  if (name !== parentName) {
    diagnostics.push(warn(location, "name-dir-mismatch", "name 与父目录名不一致"));
  }
  if ([...name].length > NAME_MAX_LENGTH) {
    diagnostics.push(warn(location, "name-too-long", "name 超过 64 个字符"));
  }
  if (!nameCharset.test(name)) {
    diagnostics.push(warn(location, "name-charset", "name 含有小写字母、数字和连字符以外的字符"));
  }
  if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) {
    diagnostics.push(warn(location, "name-hyphen", "name 以连字符开头或结尾，或含有连续连字符"));
  }
  if ([...description].length > DESCRIPTION_MAX_LENGTH) {
    diagnostics.push(warn(location, "description-too-long", "description 超过 1024 个字符"));
  }
  if (
    frontmatter.compatibility !== undefined &&
    [...frontmatter.compatibility].length > COMPATIBILITY_MAX_LENGTH
  ) {
    diagnostics.push(warn(location, "compatibility-too-long", "compatibility 超过 500 个字符"));
  }
  if (frontmatter.metadataInvalid) {
    diagnostics.push(warn(location, "metadata-invalid", "metadata 不是字符串映射，已丢弃"));
  }

  return {
    status: "load",
    skill: {
      name,
      description,
      location,
      license: frontmatter.license,
      compatibility: frontmatter.compatibility,
      metadata: frontmatter.metadataInvalid ? undefined : frontmatter.metadata,
      allowedTools: frontmatter.allowedTools,
    },
    diagnostics,
  };
};

function skip(location: string, code: SkillDiagnosticCode, message: string): ValidationResult {
  return { status: "skip", diagnostics: [warn(location, code, message, "error")] };
}

function warn(
  location: string,
  code: SkillDiagnosticCode,
  message: string,
  level: SkillDiagnostic["level"] = "warn",
): SkillDiagnostic {
  return { level, code, message, location };
}

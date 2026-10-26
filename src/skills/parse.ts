import { parse as parseYaml } from "yaml";
import type { SkillDiagnostic } from "./diagnostics.js";
import { SKILL_FRONTMATTER_FIELDS } from "./constants.js";

/** frontmatter 抽出的字段。name 和 description 在校验前都可缺。 */
export type SkillFrontmatter = {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  /** metadata 字段存在，但不是字符串到字符串的映射。 */
  metadataInvalid?: boolean;
  allowedTools?: string;
};

export type ParseSkillInput = {
  content: string;
  location: string;
  parentName: string;
};

export type ParsedSkill = {
  location: string;
  parentName: string;
  frontmatter: SkillFrontmatter;
  /** 去掉首尾空白后的 markdown 正文。 */
  body: string;
};

export type ParseSkillResult =
  | { ok: true; skill: ParsedSkill }
  | { ok: false; diagnostic: SkillDiagnostic };

/**
 * 从 SKILL.md 文本抽出 YAML frontmatter 和正文。
 *
 * 开头要有一对 ---。没有成对分隔符时失败，诊断码为 frontmatter-missing。
 * 完全无法解析前，允许先把「未加引号且值里含冒号」的常见非法 YAML
 * 收成合法 YAML 再试一次。仍失败则为 yaml-unparseable。
 * 成功时 body 是闭合 --- 之后的内容，去掉首尾空白。
 */
export type ParseSkill = (input: ParseSkillInput) => ParseSkillResult;

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

export const parseSkill: ParseSkill = (input) => {
  const content = input.content.replace(/^\uFEFF/, "");
  const matched = frontmatterPattern.exec(content);
  if (!matched) {
    return {
      ok: false,
      diagnostic: diagnostic(
        "frontmatter-missing",
        "SKILL.md 缺少成对的 --- frontmatter",
        input.location,
      ),
    };
  }

  const raw = matched[1] ?? "";
  const parsed = readYaml(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      diagnostic: diagnostic("yaml-unparseable", "frontmatter YAML 无法解析", input.location),
    };
  }

  const metadata = readMetadata(parsed.value[SKILL_FRONTMATTER_FIELDS.metadata]);
  return {
    ok: true,
    skill: {
      location: input.location,
      parentName: input.parentName,
      body: (matched[2] ?? "").trim(),
      frontmatter: {
        name: readString(parsed.value[SKILL_FRONTMATTER_FIELDS.name]),
        description: readString(parsed.value[SKILL_FRONTMATTER_FIELDS.description]),
        license: readString(parsed.value[SKILL_FRONTMATTER_FIELDS.license]),
        compatibility: readString(parsed.value[SKILL_FRONTMATTER_FIELDS.compatibility]),
        metadata: metadata.metadata,
        metadataInvalid: metadata.invalid,
        allowedTools: readString(parsed.value[SKILL_FRONTMATTER_FIELDS.allowedTools]),
      },
    },
  };
};

function readYaml(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const direct = parseDocument(raw);
  if (direct.ok) return direct;
  const repaired = parseDocument(quotePlainColons(raw));
  return repaired.ok ? repaired : { ok: false };
}

function parseDocument(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const value: unknown = raw.trim() === "" ? {} : parseYaml(raw);
    if (!isRecord(value)) return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function quotePlainColons(raw: string): string {
  return raw.replace(/^([ \t]*[A-Za-z0-9_-]+:[ \t]+)(.+)$/gm, (line, prefix: string, value: string) => {
    const trimmed = value.trim();
    if (
      !trimmed.includes(":") ||
      trimmed.startsWith('"') ||
      trimmed.startsWith("'") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("[") ||
      trimmed.startsWith("{")
    ) {
      return line;
    }
    const escaped = trimmed.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    return `${prefix}"${escaped}"`;
  });
}

function readMetadata(value: unknown): { metadata?: Record<string, string>; invalid: boolean } {
  if (value === undefined) return { invalid: false };
  if (!isRecord(value)) return { invalid: true };
  const metadata: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return { invalid: true };
    metadata[key] = item;
  }
  return { metadata, invalid: false };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(code: SkillDiagnostic["code"], message: string, location: string): SkillDiagnostic {
  return { level: "error", code, message, location };
}

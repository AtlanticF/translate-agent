import type { SkillDiagnostic } from "./diagnostics.js";

/** frontmatter 抽出的字段。name 和 description 在校验前都可缺。 */
export type SkillFrontmatter = {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
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

export type SkillDiagnosticLevel = "warn" | "error";

export type SkillDiagnosticCode =
  | "frontmatter-missing"
  | "yaml-unparseable"
  | "description-missing"
  | "description-too-long"
  | "name-missing"
  | "name-too-long"
  | "name-dir-mismatch"
  | "name-charset"
  | "name-hyphen"
  | "compatibility-too-long"
  | "metadata-invalid"
  | "name-collision"
  | "scan-truncated";

export type SkillDiagnostic = {
  level: SkillDiagnosticLevel;
  code: SkillDiagnosticCode;
  message: string;
  location?: string;
};

/** warn-load 仍加载；skip 丢弃该 skill。 */
export type LenientAction = "warn-load" | "skip";

export type LenientRule = {
  code: SkillDiagnosticCode;
  action: LenientAction;
};

/**
 * 宽松校验处置。error 级问题对应 skip，warn 级问题对应 warn-load。
 * name 的字符集和连字符按规范本应拒绝，这里放宽为警告后加载。
 */
export const LENIENT_RULES = [
  { code: "name-dir-mismatch", action: "warn-load" },
  { code: "name-too-long", action: "warn-load" },
  { code: "name-charset", action: "warn-load" },
  { code: "name-hyphen", action: "warn-load" },
  { code: "description-missing", action: "skip" },
  { code: "yaml-unparseable", action: "skip" },
  { code: "frontmatter-missing", action: "skip" },
  { code: "name-missing", action: "skip" },
  { code: "description-too-long", action: "warn-load" },
  { code: "compatibility-too-long", action: "warn-load" },
  { code: "metadata-invalid", action: "warn-load" },
  { code: "name-collision", action: "warn-load" },
  { code: "scan-truncated", action: "warn-load" },
] as const satisfies readonly LenientRule[];

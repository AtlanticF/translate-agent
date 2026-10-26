/** 每个 skill 目录里必须存在的文件名。 */
export const SKILL_FILENAME = "SKILL.md";

/** name 最长 64。超长只警告，仍然加载。 */
export const NAME_MAX_LENGTH = 64;

/** description 最长 1024。超长只警告，原文保留。 */
export const DESCRIPTION_MAX_LENGTH = 1024;

/** compatibility 最长 500。超长只警告，原文保留。 */
export const COMPATIBILITY_MAX_LENGTH = 500;

/** 规范 frontmatter 字段。allowedTools 在文件里写作 allowed-tools。 */
export const SKILL_FRONTMATTER_FIELDS = {
  name: "name",
  description: "description",
  license: "license",
  compatibility: "compatibility",
  metadata: "metadata",
  allowedTools: "allowed-tools",
} as const;

/** 从 skills 根目录往下最多 6 层。 */
export const SCAN_MAX_DEPTH = 6;

/** 一次发现最多走 2000 个目录。 */
export const SCAN_MAX_DIRECTORIES = 2000;

/** 这些目录名不进入扫描。 */
export const SKIP_DIRECTORY_NAMES = [".git", "node_modules"] as const;

/** catalog prompt 使用的 XML 标签名。 */
export const XML_TAGS = {
  availableSkills: "available_skills",
  skill: "skill",
  name: "name",
  description: "description",
  location: "location",
} as const;

import { expect, test } from "vitest";
import {
  COMPATIBILITY_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SCAN_MAX_DEPTH,
  SCAN_MAX_DIRECTORIES,
  SKILL_FILENAME,
  SKILL_FRONTMATTER_FIELDS,
  SKIP_DIRECTORY_NAMES,
  XML_TAGS,
} from "./constants.js";
import { LENIENT_RULES, type SkillDiagnosticCode } from "./diagnostics.js";

const lenientActions: Record<SkillDiagnosticCode, "warn-load" | "skip"> = {
  "name-dir-mismatch": "warn-load",
  "name-too-long": "warn-load",
  "name-charset": "warn-load",
  "name-hyphen": "warn-load",
  "description-missing": "skip",
  "yaml-unparseable": "skip",
  "frontmatter-missing": "skip",
  "name-missing": "skip",
  "description-too-long": "warn-load",
  "compatibility-too-long": "warn-load",
  "metadata-invalid": "warn-load",
  "name-collision": "warn-load",
  "scan-truncated": "warn-load",
};

test("locks skill spec limits and scan bounds", () => {
  expect(SKILL_FILENAME).toBe("SKILL.md");
  expect(NAME_MAX_LENGTH).toBe(64);
  expect(DESCRIPTION_MAX_LENGTH).toBe(1024);
  expect(COMPATIBILITY_MAX_LENGTH).toBe(500);
  expect(SCAN_MAX_DEPTH).toBe(6);
  expect(SCAN_MAX_DIRECTORIES).toBe(2000);
  expect(SKIP_DIRECTORY_NAMES).toEqual([".git", "node_modules"]);
});

test("locks frontmatter fields and catalog xml tags", () => {
  expect(SKILL_FRONTMATTER_FIELDS).toEqual({
    name: "name",
    description: "description",
    license: "license",
    compatibility: "compatibility",
    metadata: "metadata",
    allowedTools: "allowed-tools",
  });
  expect(XML_TAGS).toEqual({
    availableSkills: "available_skills",
    skill: "skill",
    name: "name",
    description: "description",
    location: "location",
  });
});

test("locks lenient validation actions", () => {
  expect(LENIENT_RULES).toHaveLength(Object.keys(lenientActions).length);
  expect(new Set(LENIENT_RULES.map((rule) => rule.code)).size).toBe(LENIENT_RULES.length);

  for (const rule of LENIENT_RULES) {
    expect(rule.action).toBe(lenientActions[rule.code]);
  }
});

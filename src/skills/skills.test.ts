import { expect, test } from "vitest";
import { SCAN_MAX_DEPTH } from "./constants.js";
import { loadSkills } from "./catalog.js";
import { discoverSkills } from "./discover.js";
import type { SkillDirEntry, SkillFs } from "./fs.js";
import { parseSkill } from "./parse.js";
import { buildSkillsPrompt } from "./prompt.js";
import { validateSkill } from "./validator.js";

const skillFile = (name: string, description = `Use ${name}.`, extra = "") => `---
name: ${name}
description: ${description}
${extra}---

# ${name}
`;

test("parses frontmatter and keeps the trimmed body", () => {
  const parsed = parseSkill({
    content: skillFile("pdf-processing", "Extract PDF text.", 'license: Apache-2.0\nmetadata:\n  author: example-org\n'),
    location: "/skills/pdf-processing/SKILL.md",
    parentName: "pdf-processing",
  });

  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.skill.frontmatter).toMatchObject({
    name: "pdf-processing",
    description: "Extract PDF text.",
    license: "Apache-2.0",
    metadata: { author: "example-org" },
  });
  expect(parsed.skill.body).toBe("# pdf-processing");
});

test("repairs an unquoted colon in a frontmatter value", () => {
  const parsed = parseSkill({
    content: `---
name: pdf-processing
description: Use this skill when: the user asks about PDFs
---
body`,
    location: "/skills/pdf-processing/SKILL.md",
    parentName: "pdf-processing",
  });

  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.skill.frontmatter.description).toBe("Use this skill when: the user asks about PDFs");
});

test("skips a file without frontmatter or with broken yaml", () => {
  expect(
    parseSkill({ content: "# no frontmatter", location: "/skills/a/SKILL.md", parentName: "a" }),
  ).toMatchObject({ ok: false, diagnostic: { code: "frontmatter-missing" } });
  expect(
    parseSkill({
      content: "---\nname: [\n---\n",
      location: "/skills/a/SKILL.md",
      parentName: "a",
    }),
  ).toMatchObject({ ok: false, diagnostic: { code: "yaml-unparseable" } });
});

test("warns on cosmetic name issues and still loads", () => {
  const longName = "n".repeat(65);
  const mismatched = validateSkill({
    location: "/skills/other/SKILL.md",
    parentName: "other",
    body: "",
    frontmatter: { name: "pdf-processing", description: "Extract PDF text." },
  });
  const tooLong = validateSkill({
    location: `/skills/${longName}/SKILL.md`,
    parentName: longName,
    body: "",
    frontmatter: { name: longName, description: "Extract PDF text." },
  });

  expect(mismatched).toMatchObject({ status: "load", skill: { name: "pdf-processing" } });
  expect(mismatched.diagnostics.map((item) => item.code)).toContain("name-dir-mismatch");
  expect(tooLong.status).toBe("load");
  expect(tooLong.diagnostics.map((item) => item.code)).toContain("name-too-long");
});

test("skips a skill when the description is missing", () => {
  const result = validateSkill({
    location: "/skills/pdf-processing/SKILL.md",
    parentName: "pdf-processing",
    body: "",
    frontmatter: { name: "pdf-processing", description: "  " },
  });

  expect(result.status).toBe("skip");
  expect(result.diagnostics.map((item) => item.code)).toEqual(["description-missing"]);
});

test("discovers nested skills and skips ignored directories", async () => {
  const fs = memorySkillFs({
    "/skills/README.md": "ignore",
    "/skills/SKILL.md": skillFile("root"),
    "/skills/pdf-processing/SKILL.md": skillFile("pdf-processing"),
    "/skills/pdf-processing/nested/SKILL.md": skillFile("nested"),
    "/skills/.git/hidden/SKILL.md": skillFile("hidden"),
    "/skills/node_modules/pkg/SKILL.md": skillFile("pkg"),
  });

  const discovered = await discoverSkills(fs, [{ path: "/skills", precedence: 0 }]);

  expect(discovered.skills.map((skill) => skill.location)).toEqual([
    "/skills/pdf-processing/SKILL.md",
  ]);
  expect(discovered.diagnostics).toEqual([]);
});

test("records truncation when a skill sits past the depth limit", async () => {
  const parts = Array.from({ length: SCAN_MAX_DEPTH + 1 }, (_, index) => `d${index + 1}`);
  const location = `/skills/${parts.join("/")}/SKILL.md`;
  const discovered = await discoverSkills(memorySkillFs({ [location]: skillFile("too-deep") }), [
    { path: "/skills", precedence: 0 },
  ]);

  expect(discovered.skills).toEqual([]);
  expect(discovered.diagnostics.map((item) => item.code)).toEqual(["scan-truncated"]);
});

test("keeps the higher precedence skill when names collide", async () => {
  const catalog = await loadSkills(
    memorySkillFs({
      "/user/pdf-processing/SKILL.md": skillFile("pdf-processing", "from user"),
      "/project/pdf-processing/SKILL.md": skillFile("pdf-processing", "from project"),
    }),
    [
      { path: "/user", precedence: 0 },
      { path: "/project", precedence: 1 },
    ],
  );

  expect(catalog.skills.get("pdf-processing")?.description).toBe("from project");
  expect(catalog.diagnostics.map((item) => item.code)).toContain("name-collision");
});

test("builds an empty prompt when nothing loaded and escapes catalog text", () => {
  expect(buildSkillsPrompt([])).toBe("");
  const prompt = buildSkillsPrompt([
    {
      name: "pdf-processing",
      description: "a < b & c",
      location: "/skills/pdf-processing/SKILL.md",
    },
  ]);

  expect(prompt).toContain("<available_skills>");
  expect(prompt).toContain("<name>pdf-processing</name>");
  expect(prompt).toContain("<description>a &lt; b &amp; c</description>");
  expect(prompt).not.toContain("a < b & c");
});

function memorySkillFs(files: Record<string, string>): SkillFs {
  const directories = new Set<string>(["/"]);
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts.slice(0, -1)) {
      current += `/${part}`;
      directories.add(current);
    }
  }

  const dirname = (filePath: string) => {
    const index = filePath.lastIndexOf("/");
    return index <= 0 ? "/" : filePath.slice(0, index);
  };

  return {
    async readFile(filePath) {
      const text = files[filePath];
      if (text === undefined) throw new Error(`missing ${filePath}`);
      return text;
    },
    async exists(filePath) {
      return Object.hasOwn(files, filePath) || directories.has(filePath);
    },
    join(...parts) {
      return parts.reduce((result, part) => {
        if (!result) return part;
        return `${result.replace(/\/$/, "")}/${part.replace(/^\//, "")}`;
      }, "");
    },
    dirname,
    basename(filePath) {
      const index = filePath.lastIndexOf("/");
      return index === -1 ? filePath : filePath.slice(index + 1);
    },
    async readDir(dir) {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const seen = new Map<string, SkillDirEntry["kind"]>();
      const consider = (fullPath: string, kind: SkillDirEntry["kind"]) => {
        if (!fullPath.startsWith(prefix) || fullPath === dir) return;
        const rest = fullPath.slice(prefix.length);
        const name = rest.split("/")[0];
        if (!name) return;
        const childKind = rest.includes("/") ? "directory" : kind;
        if (seen.get(name) !== "directory") seen.set(name, childKind);
      };
      for (const filePath of Object.keys(files)) consider(filePath, "file");
      for (const directory of directories) consider(directory, "directory");
      return [...seen].map(([name, kind]) => ({ name, kind }));
    },
  };
}

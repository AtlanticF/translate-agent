import {
  buildSkillsPrompt,
  createRepoSkillFs,
  loadSkills,
  parseRepoSkillsIndex,
  type SkillDiagnostic,
  type SkillFs,
} from "./skills-core.js";
import type { SkillsBundle } from "./skills-bundle";

export type LoadedSkills = {
  fs: SkillFs;
  prompt: string;
  diagnostics: readonly SkillDiagnostic[];
};

export async function loadWebSkills(bundle: SkillsBundle): Promise<LoadedSkills> {
  const fs = createRepoSkillFs(
    parseRepoSkillsIndex({ root: bundle.root, files: Object.keys(bundle.files) }),
    async (virtualPath) => {
      const content = bundle.files[virtualPath];
      if (content === undefined) {
        throw new Error(`File not found: ${virtualPath}`);
      }
      return content;
    },
  );
  const catalog = await loadSkills(fs, [{ path: "/.skills", precedence: 0 }]);
  return {
    fs,
    prompt: buildSkillsPrompt([...catalog.skills.values()]),
    diagnostics: catalog.diagnostics,
  };
}

export function isSkillsPath(path: string): boolean {
  return path === "/.skills" || path.startsWith("/.skills/");
}

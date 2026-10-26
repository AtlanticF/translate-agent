import {
  buildSkillsPrompt,
  loadSkills,
  type SkillDiagnostic,
  type SkillFs,
} from "../skills/index.js";
import { createNodeSkillFs } from "./skill-fs.js";

export const projectSkillsDirectory = ".skills";

export async function loadProjectSkills(
  cwd = process.cwd(),
  skillFs: SkillFs = createNodeSkillFs(),
): Promise<{ prompt: string; diagnostics: readonly SkillDiagnostic[] }> {
  const catalog = await loadSkills(skillFs, [
    { path: skillFs.join(cwd, projectSkillsDirectory), precedence: 0 },
  ]);
  return {
    prompt: buildSkillsPrompt([...catalog.skills.values()]),
    diagnostics: catalog.diagnostics,
  };
}

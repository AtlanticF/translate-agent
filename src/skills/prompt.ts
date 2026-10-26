import type { SkillRecord } from "./catalog.js";

/**
 * 有 skill 时放在 catalog XML 前面。
 * 没有 skill 时整段 prompt 为空，不要输出这段说明，也不要输出空的 available_skills。
 */
export const SKILLS_PROMPT_INSTRUCTIONS = `The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, use your file-read tool to load the SKILL.md at the listed location before proceeding.
When a skill references relative paths, resolve them against the skill's directory (the parent of SKILL.md) and use absolute paths in tool calls.`;

/**
 * system prompt 在 skills catalog 非空时附上这段启用规则。
 * 模型必须先读 location 上的 SKILL.md，再按需懒加载 scripts、references、assets。
 */
export const SKILL_ACTIVATION_POLICY = `## Skill Activation and Loading Policy

When you determine that a specific skill can help fulfill the user's current request, you must activate that skill.
Skill activation is a deliberate, multi-step process and must follow the rules below exactly.

### Skill Activation Procedure

1. Always start by reading the skill location file
- Use the Read tool to load the file specified by the skill's location.
- This file contains the complete and authoritative instructions for the skill.
2. Resolve referenced instructions on demand
- If the skill's location file references additional files (for example, scripts, references, or assets), use the LS or Read tools to load them only when required to correctly apply the skill.
3. Apply strict on-demand loading
- Activate a skill only if it is relevant to the current user request.
- Load referenced files only if their contents are necessary for the current task.
- Do not eagerly load all referenced files by default.

### Operational Constraints

- A skill is considered active only after its entry file has been read.
- You must follow the instructions defined in the activated skill as binding constraints.
- Do not rely on prior knowledge of a skill's behavior without reading its files in the current session.`;

/**
 * 把已收集的 skill 编成 catalog prompt。
 *
 * 没有 skill 时返回空字符串。
 * 有 skill 时返回 SKILLS_PROMPT_INSTRUCTIONS，再加上 available_skills XML：
 * 每个 skill 含 name、description、location。文本内容要做 XML 转义。
 * system prompt 收到非空结果后，会再附上 SKILL_ACTIVATION_POLICY。
 */
export type BuildSkillsPrompt = (skills: readonly SkillRecord[]) => string;

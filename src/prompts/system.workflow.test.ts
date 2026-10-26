import { expect, test } from "vitest";
import { SKILL_ACTIVATION_POLICY } from "../skills/prompt.js";
import { SYSTEM_WORKFLOW } from "./system.workflow.js";

test("describes the translation workflow without preferences when memory is empty", () => {
  const prompt = SYSTEM_WORKFLOW({ currentMemory: "" });

  expect(prompt).toContain("Use the 'LS' tool to find files to translate.");
  expect(prompt).toContain("always use the 'Read' tool to fetch the latest file contents.");
  expect(prompt).toContain("Use the 'Translate' tool to create translation units.");
  expect(prompt).toContain("Status 'Approve' or 'Refine' means the unit is complete");
  expect(prompt).toContain("'Reject' means re-translation is required.");
  expect(prompt).toContain("Keep your responses short, since they will be displayed on a command line interface.");
  expect(prompt).not.toContain("# User preferences");
  expect(prompt).not.toContain("# Skills");
  expect(prompt).not.toContain(SKILL_ACTIVATION_POLICY);
});

test("omits skills when the skills prompt is blank", () => {
  const prompt = SYSTEM_WORKFLOW({ currentMemory: "", skillsPrompt: "  \n" });

  expect(prompt).not.toContain("# Skills");
  expect(prompt).not.toContain(SKILL_ACTIVATION_POLICY);
});

test("appends current memory as user preferences", () => {
  const currentMemory = "Use a formal address. Example: prefer 您 over 你.";
  const prompt = SYSTEM_WORKFLOW({ currentMemory });

  expect(prompt).toContain("# User preferences");
  expect(prompt).toContain(currentMemory);
  expect(prompt).not.toContain("# Skills");
});

test("appends the skills catalog and activation policy when skills are present", () => {
  const skillsPrompt = `<available_skills>
  <skill>
    <name>pdf-processing</name>
    <description>Extract PDF text.</description>
    <location>/skills/pdf-processing/SKILL.md</location>
  </skill>
</available_skills>`;
  const prompt = SYSTEM_WORKFLOW({ currentMemory: "", skillsPrompt });

  expect(prompt).toContain("# Skills");
  expect(prompt).toContain("Activate a matching skill when it fits the user's intent and request.");
  expect(prompt).toContain("If no skill can satisfy the request or solve the user's problem, do not activate one.");
  expect(prompt).toContain(skillsPrompt);
  expect(prompt).toContain(SKILL_ACTIVATION_POLICY);
  expect(prompt.indexOf(skillsPrompt)).toBeLessThan(prompt.indexOf(SKILL_ACTIVATION_POLICY));
});

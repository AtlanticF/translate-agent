import { expect, test } from "vitest";
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
});

test("appends current memory as user preferences", () => {
  const currentMemory = "Use a formal address. Example: prefer 您 over 你.";
  const prompt = SYSTEM_WORKFLOW({ currentMemory });

  expect(prompt).toContain("# User preferences");
  expect(prompt).toContain(currentMemory);
});

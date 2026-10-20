import { expect, test } from "vitest";
import { COMPACT_INSTRUCTION, SYSTEM_COMPACT } from "./system.compact.js";

test("asks for an analysis and a nine-part summary", () => {
  expect(SYSTEM_COMPACT).toContain("wrap your analysis in <analysis> tags");
  expect(SYSTEM_COMPACT).toContain("<summary>");
  expect(SYSTEM_COMPACT).toContain("1. Primary Request and Intent:");
  expect(SYSTEM_COMPACT).toContain("9. Optional Next Step:");
  expect(SYSTEM_COMPACT).toContain("All user messages:");
});

test("describes a summary assistant", () => {
  expect(COMPACT_INSTRUCTION).toContain("summary assistant");
});

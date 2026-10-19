import { readdir } from "node:fs/promises";
import type { ToolExecutor } from "./executor.js";

export type LsInput = {
  path: string;
};

export type LsEntry = {
  name: string;
  type: "file" | "directory";
};

export const lsTool: ToolExecutor<LsInput, LsEntry[]> = async (input) => {
  const entries = await readdir(input.path, { withFileTypes: true });

  return entries
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

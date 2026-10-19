import { readdir } from "node:fs/promises";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";

export type LsInput = {
  path: string;
};

export type LsEntry = {
  name: string;
  type: "file" | "directory";
};

const description =
  "List the files and subdirectories in one directory. Use this to find files to translate. path must be an existing directory.";

const inputSchema = zodSchema(
  z.object({
    path: z.string().describe("Directory to list."),
  }),
);

const outputSchema = zodSchema(
  z.array(
    z.object({
      name: z.string(),
      type: z.enum(["file", "directory"]),
    }),
  ),
);

export const lsExecutor: ToolExecutor<LsInput> = async (input) => {
  const entries = await readdir(input.path, { withFileTypes: true });

  return {
    type: "json",
    payload: entries
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
};

export const lsTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input) => {
      const result = await lsExecutor(input, { name: "LS", callId: "LS" });
      if (result.type !== "json" || !Array.isArray(result.payload)) {
        throw new Error("LS executor returned an unexpected result");
      }
      return result.payload as LsEntry[];
    },
  }),
  { name: "LS" as const },
);

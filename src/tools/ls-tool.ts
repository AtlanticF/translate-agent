import { readdir } from "node:fs/promises";
import { isAbsolute, matchesGlob } from "node:path";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { SkillDirEntry } from "../skills/fs.js";
import type { ToolExecutor } from "./executor.js";

export type LsInput = {
  path: string;
  ignore?: string[];
};

export type LsEntry = {
  name: string;
  type: "file" | "directory";
};

const description = `Lists files and directories in a given path. The path parameter must be an absolute path, not a relative path. You can optionally provide an array of glob patterns to ignore with the ignore parameter. If you already know the file path, use the Read tool instead of listing the directory.`;

const inputSchema = zodSchema(
  z.strictObject({
    path: z
      .string()
      .describe(
        "The absolute path to the directory to list (must be absolute, not relative)",
      ),
    ignore: z.array(z.string()).optional().describe("List of glob patterns to ignore"),
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

export async function readLocalDir(path: string): Promise<readonly SkillDirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
  }));
}

export function createLsExecutor(
  readDir: (path: string) => Promise<readonly SkillDirEntry[]> = readLocalDir,
): ToolExecutor<LsInput> {
  return async (input) => {
    if (!isAbsolute(input.path)) {
      throw new Error("path must be an absolute path");
    }

    const entries = await readDir(input.path);
    const ignore = input.ignore ?? [];

    return {
      type: "json",
      payload: entries
        .filter((entry) => !isIgnored(entry.name, ignore))
        .map((entry) => ({
          name: entry.name,
          type: entry.kind,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  };
}

export const lsExecutor = createLsExecutor();

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

function isIgnored(name: string, patterns: readonly string[]): boolean {
  return patterns.some(
    (pattern) => matchesGlob(name, pattern) || matchesGlob(`${name}/**`, pattern),
  );
}

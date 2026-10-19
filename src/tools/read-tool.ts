import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";

export type ReadInput = {
  file_path: string;
  offset?: number;
  limit?: number;
};

export type ReadLine = {
  line: number;
  text: string;
};

export type ReadOutput = {
  lines: ReadLine[];
  warning?: string;
};

const defaultLineLimit = 2000;
const maxLineLength = 2000;

const description = `Read a file from the local filesystem. You can use this tool to access any file directly.

Assume this tool can read all files on the computer. If the user provides a file path, assume that path is valid. Reading a file that does not exist is okay; an error is returned.

Usage:
- file_path must be an absolute path, not a relative path.
- By default, read up to 2000 lines from the beginning of the file.
- You may set offset (1-based starting line) and limit (how many lines to read). This is useful for long files. Prefer omitting both so the file is read from the start.
- Any line longer than 2000 characters is truncated.
- You can call multiple tools in one response. Speculatively read several potentially useful files together.
- If the file exists but has no contents, the result contains a warning instead of file contents.
- line is the 1-based line number in the file. It is not part of the file text.`;

const inputSchema = zodSchema(
  z.object({
    file_path: z.string().describe("Absolute path of the file to read."),
    offset: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based line to start from. Omit to start at the first line."),
    limit: z
      .number()
      .int()
      .positive()
      .max(defaultLineLimit)
      .optional()
      .describe("Maximum number of lines to read. Defaults to 2000."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    lines: z.array(
      z.object({
        line: z.number().describe("1-based line number in the file."),
        text: z.string().describe("Line text, truncated to 2000 characters."),
      }),
    ),
    warning: z
      .string()
      .optional()
      .describe("Present when the file exists but has no contents."),
  }),
);

export const readExecutor: ToolExecutor<ReadInput> = async (input) => {
  if (!isAbsolute(input.file_path)) {
    throw new Error("file_path must be an absolute path");
  }

  const offset = input.offset ?? 1;
  const limit = input.limit ?? defaultLineLimit;
  if (offset < 1) {
    throw new Error("offset must be a positive line number");
  }
  if (limit < 1 || limit > defaultLineLimit) {
    throw new Error("limit must be between 1 and 2000");
  }

  let text: string;
  try {
    text = await readFile(input.file_path, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`File not found: ${input.file_path}`);
    }
    throw error;
  }

  if (text.length === 0) {
    return {
      type: "json",
      payload: {
        lines: [],
        warning: "File exists but has no contents.",
      },
    };
  }

  const allLines = text.split("\n");
  if (allLines.at(-1) === "") {
    allLines.pop();
  }

  const selected = allLines.slice(offset - 1, offset - 1 + limit);
  return {
    type: "json",
    payload: {
      lines: selected.map((line, index) => ({
        line: offset + index,
        text: line.length > maxLineLength ? line.slice(0, maxLineLength) : line,
      })),
    },
  };
};

export const readTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input) => {
      const result = await readExecutor(input, { name: "Read", callId: "Read" });
      if (
        result.type !== "json" ||
        result.payload === null ||
        typeof result.payload !== "object" ||
        Array.isArray(result.payload)
      ) {
        throw new Error("Read executor returned an unexpected result");
      }
      return result.payload as ReadOutput;
    },
  }),
  { name: "Read" as const },
);

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

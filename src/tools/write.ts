import { writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";

export type WriteInput = {
  file_path: string;
  content: string;
};

export type WriteOutput = {
  file_path: string;
};

export type WriteWriter = (input: WriteInput) => Promise<WriteOutput>;

// Write 只用于小的非翻译产物；整篇译文必须走 Translate 逐段出，否则会绕过用户审核且请求会超时。
const maxWriteChars = 2000;

const description = `Write a small, non-translation text artifact to a file.

The file path must be absolute. Always use the returned file_path for subsequent Read and Translate calls because an environment-specific writer may return a different path.
NEVER use this tool to write translated content: translations must be produced only through the 'Translate' tool, one unit per call. Large writes (over ${maxWriteChars} characters) are rejected.`;

const inputSchema = zodSchema(
  z.object({
    file_path: z.string().describe("Absolute destination path or suggested session file path."),
    content: z.string().describe("UTF-8 text to write. Not for translations; use Translate instead."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    file_path: z.string().describe("Actual path of the written file."),
  }),
);

export function createWriteExecutor(writer: WriteWriter = writeLocalFile): ToolExecutor<WriteInput> {
  return async (input) => {
    if (!isAbsolute(input.file_path)) {
      throw new Error("file_path must be an absolute path");
    }
    if (input.content.length > maxWriteChars) {
      throw new Error(
        `content exceeds ${maxWriteChars} characters. Translations must go through the 'Translate' tool one unit at a time; do not bulk-write translations with Write.`,
      );
    }
    return { type: "json", payload: await writer(input) };
  };
}

export const writeExecutor = createWriteExecutor();

export const writeTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input) => {
      const result = await writeExecutor(input, { name: "Write", callId: "Write" });
      if (result.type !== "json" || !isObject(result.payload)) {
        throw new Error("Write executor returned an unexpected result");
      }
      return result.payload as unknown as WriteOutput;
    },
  }),
  { name: "Write" as const },
);

async function writeLocalFile(input: WriteInput): Promise<WriteOutput> {
  await writeFile(input.file_path, input.content, "utf8");
  return { file_path: input.file_path };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

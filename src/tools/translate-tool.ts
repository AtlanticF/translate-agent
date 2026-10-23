import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { CopilotResponse } from "../prompts/system.memory.js";
import type { ToolExecutor, ToolExecutorResult } from "./executor.js";

export type TranslateInput = {
  file_path: string;
  src_string: string;
  translate_string: string;
};

export type TranslateOutput = {
  translated_string: string;
  status: "approve" | "reject" | "refined";
  reason: string;
};

export type TranslateWriter = (params: {
  contents: string;
  file_path: string;
  translated_string: string;
}) => Promise<void>;

export type TranslateReader = (filePath: string) => Promise<string>;

const maxSourceLength = 300;

const description = `Create translation units for documents to be translated. According to the current context's requirements, select a limited amount of text each time for translation. During translation, follow the user's requirements including target language, tone, and terminology.

- Before translating a specific file, ensure the 'Read' tool has been used in the current context to read that same absolute file_path, so you have the latest file contents.
- file_path must be an absolute path, not a relative path.
- The tool replaces that unique src_string in the file. The rest of the file stays as it is.
- The 'src_string' must be unique in the original text; if it's not unique the translation will fail. You can ensure uniqueness by expanding the 'src_string' range.
- Do not include the Read tool's line number in src_string. line is not part of the file text.
- 'src_string' should contain only the current unit's content and must not include content from previously translated units. Keep it within 300 characters.
- 'translate_string' is the draft translation of 'src_string' but should be as accurate as possible to reduce later manual proofreading.
- The returned 'translated_string' is the final translation after human review. 'status' indicates the human review state and can be 'approve', 'reject', or 'refined' (user manually adjusted).
- If 'reject' is due to 'src_string' not existing in the original text, verify the selected unit and ensure spacing and line breaks match.
- If 'reject' is due to 'src_string' being non-unique, gradually increase its scope until you find a unique match.
`;

const inputSchema = zodSchema(
  z.object({
    file_path: z
      .string()
      .describe("Absolute path of the file being translated."),
    src_string: z
      .string()
      .describe("The partial source string to translate. It must be unique in the file."),
    translate_string: z
      .string()
      .describe("The draft translation of the source string."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    translated_string: z
      .string()
      .describe("The translated string, with human review applied."),
    status: z
      .enum(["approve", "reject", "refined"])
      .describe("The human review status."),
    reason: z
      .string()
      .describe("The reason for the status. Empty when not rejected."),
  }),
);

export const translateTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
  }),
  { name: "Translate" as const },
);

export function createTranslateExecutor({
  writer,
  read = readTranslation,
}: {
  writer: TranslateWriter;
  read?: TranslateReader;
}): ToolExecutor<TranslateInput> {
  return async (input, options, copilotResponse) => {
    if (!isAbsolute(input.file_path)) {
      throw new Error("file_path must be an absolute path");
    }

    if (input.src_string.length > maxSourceLength) {
      return reject("Source string exceeds maximum length of 300 characters");
    }

    const text = await read(input.file_path);
    const found = findUnique(text, input.src_string);
    if ("reason" in found) {
      return reject(found.reason);
    }

    if (!copilotResponse) {
      return {
        type: "copilot-request",
        payload: {
          tool: {
            name: options.name,
            callId: options.callId,
          },
          file_path: input.file_path,
          src_string: input.src_string,
          translate_string: input.translate_string,
        },
      };
    }

    const output = reviewedTranslation(input, copilotResponse);
    if (copilotResponse.status !== "approve" && options.memory) {
      await options.memory.extractMemory({
        req: {
          tool: { name: options.name, callId: options.callId },
          file_path: input.file_path,
          src_string: input.src_string,
          translate_string: input.translate_string,
        },
        res: copilotResponse,
      });
    }
    if (output.status === "approve" || output.status === "refined") {
      await writer({
        contents: replaceAt(text, found.start, input.src_string.length, output.translated_string),
        file_path: input.file_path,
        translated_string: output.translated_string,
      });
    }

    return {
      type: "json",
      payload: output,
    };
  };
}

function reject(reason: string): ToolExecutorResult {
  return {
    type: "json",
    payload: {
      translated_string: "",
      status: "reject",
      reason,
    },
  };
}

function findUnique(text: string, src: string): { start: number } | { reason: string } {
  if (src.length === 0) {
    return { reason: "src_string is empty" };
  }

  const start = text.indexOf(src);
  if (start < 0) {
    return { reason: "src_string was not found in the file" };
  }
  if (text.indexOf(src, start + src.length) !== -1) {
    return { reason: "src_string is not unique in the file" };
  }
  return { start };
}

function replaceAt(text: string, start: number, length: number, translated: string): string {
  return text.slice(0, start) + translated + text.slice(start + length);
}

async function readTranslation(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`File not found: ${filePath}`);
    }
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function reviewedTranslation(
  input: TranslateInput,
  response: CopilotResponse,
): TranslateOutput {
  if (response.status === "reject") {
    return {
      translated_string: "",
      status: "reject",
      reason: response.reason,
    };
  }

  if (response.status === "refined") {
    return {
      translated_string: response.refined_translated_string,
      status: "refined",
      reason: "",
    };
  }

  return {
    translated_string: input.translate_string,
    status: "approve",
    reason: "",
  };
}

import TurndownService from "turndown";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";
import { localWebFileIO, safeWebFileName, type WebFileIO } from "./web-io.js";

export type ConvertHtmlToMarkdownInput = {
  file_path: string;
  file_path_out?: string;
};

export type ConvertHtmlToMarkdownOutput = {
  file_path: string;
  bytes: number;
  preview: string;
};

const previewLength = 200;

const description = `Convert clean article HTML to Markdown with Turndown and save the result server-side.

Use this tool after webDocTransfer, passing the file_path it returned (never the HTML contents). It preserves headings, paragraphs, lists, links, emphasis, and code blocks, writes the Markdown file, and returns the saved file_path plus a short preview. Use the returned file_path for subsequent Read and Translate calls.`;

const inputSchema = zodSchema(
  z.object({
    file_path: z.string().describe("file_path of the clean article HTML returned by webDocTransfer."),
    file_path_out: z
      .string()
      .optional()
      .describe("Optional suggested destination path or file name for the Markdown output."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    file_path: z.string().describe("Actual path of the saved Markdown file. Use this for Read and Translate."),
    bytes: z.number().describe("Size of the Markdown in bytes."),
    preview: z.string().describe("First characters of the Markdown, for a quick sanity check."),
  }),
);

export function createConvertHtmlToMarkdownExecutor(
  io: WebFileIO = localWebFileIO,
): ToolExecutor<ConvertHtmlToMarkdownInput> {
  return async (input) => {
    const html = await io.read(input.file_path);
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    const markdown = turndown.turndown(html);

    const saved = await io.save({
      name: input.file_path_out || markdownName(input.file_path),
      mediaType: "text/markdown",
      content: markdown,
    });

    return {
      type: "json",
      payload: {
        file_path: saved.file_path,
        bytes: markdown.length,
        preview: markdown.replace(/\s+/g, " ").trim().slice(0, previewLength),
      },
    };
  };
}

export const convertHtmlToMarkdownExecutor = createConvertHtmlToMarkdownExecutor();

export const convertHtmlToMarkdownTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input) => {
      const result = await convertHtmlToMarkdownExecutor(input, {
        name: "convertHtmlToMarkdown",
        callId: "convertHtmlToMarkdown",
      });
      if (result.type !== "json" || !isObject(result.payload)) {
        throw new Error("convertHtmlToMarkdown executor returned an unexpected result");
      }
      return result.payload as unknown as ConvertHtmlToMarkdownOutput;
    },
  }),
  { name: "convertHtmlToMarkdown" as const },
);

function markdownName(filePath: string): string {
  const base = filePath.split("/").filter(Boolean).at(-1) ?? "";
  return `${safeWebFileName(base.replace(/\.[^.]+$/, ""))}.md`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

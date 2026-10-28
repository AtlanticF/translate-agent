import { tool, zodSchema } from "ai";
import TurndownService from "turndown";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";

export type ConvertHtmlToMarkdownInput = {
  html: string;
};

export type ConvertHtmlToMarkdownOutput = {
  markdown: string;
};

const description = `Convert clean article HTML to Markdown with Turndown.

Use this tool after webDocTransfer. It preserves headings, paragraphs, lists, links, emphasis, and code blocks. It does not fetch URLs, extract article content, or write files.`;

const inputSchema = zodSchema(
  z.object({
    html: z.string().describe("Clean article HTML to convert to Markdown."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    markdown: z.string().describe("Markdown representation of the supplied HTML."),
  }),
);

export const convertHtmlToMarkdownExecutor: ToolExecutor<ConvertHtmlToMarkdownInput> = async (
  input,
) => {
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  return {
    type: "json",
    payload: { markdown: turndown.turndown(input.html) },
  };
};

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

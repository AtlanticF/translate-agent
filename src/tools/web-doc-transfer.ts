import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";

export type WebDocTransferInput = {
  url: string;
  html: string;
};

export type WebDocTransferOutput = {
  title: string;
  html: string;
};

const description = `Extract the main article from an HTML document with Readability.

Pass the final article URL and the HTML returned by WebFetch. This tool removes navigation and other non-article content and returns clean article HTML. It does not fetch URLs or convert HTML to Markdown.`;

const inputSchema = zodSchema(
  z.object({
    url: z.string().describe("Final article URL used to resolve relative links."),
    html: z.string().describe("Raw HTML returned by WebFetch."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    title: z.string().describe("Extracted article title."),
    html: z.string().describe("Clean HTML containing only the extracted article body."),
  }),
);

export const webDocTransferExecutor: ToolExecutor<WebDocTransferInput> = async (input) => {
  const url = parseHttpUrl(input.url);
  const { document } = parseHTML(input.html);
  const base = document.createElement("base");
  base.setAttribute("href", url.href);
  document.head?.appendChild(base);

  const article = new Readability(document as unknown as Document).parse();
  if (!article?.content || !article.textContent?.trim()) {
    throw new Error("Unable to extract an article from the HTML document");
  }

  return {
    type: "json",
    payload: {
      title: article.title?.trim() || "Untitled article",
      html: article.content,
    },
  };
};

export const webDocTransferTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input) => {
      const result = await webDocTransferExecutor(input, {
        name: "webDocTransfer",
        callId: "webDocTransfer",
      });
      if (result.type !== "json" || !isObject(result.payload)) {
        throw new Error("webDocTransfer executor returned an unexpected result");
      }
      return result.payload as unknown as WebDocTransferOutput;
    },
  }),
  { name: "webDocTransfer" as const },
);

function parseHttpUrl(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return url;
  } catch {
    throw new Error("url must be a valid HTTP or HTTPS URL");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

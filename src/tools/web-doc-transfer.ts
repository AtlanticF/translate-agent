import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";
import { localWebFileIO, safeWebFileName, type WebFileIO } from "./web-io.js";

export type WebDocTransferInput = {
  url: string;
  file_path: string;
};

export type WebDocTransferOutput = {
  title: string;
  file_path: string;
  bytes: number;
  preview: string;
};

const previewLength = 200;

const description = `Extract the main article from a saved HTML document with Readability.

Pass the final article URL and the file_path returned by WebFetch (never the HTML contents). This tool reads the saved raw HTML, removes navigation and other non-article content, saves the clean article HTML server-side, and returns its file_path plus a short preview. It does not fetch URLs or convert HTML to Markdown.`;

const inputSchema = zodSchema(
  z.object({
    url: z.string().describe("Final article URL used to resolve relative links."),
    file_path: z.string().describe("file_path of the raw HTML returned by WebFetch."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    title: z.string().describe("Extracted article title."),
    file_path: z.string().describe("Server-side path of the clean article HTML. Pass this to convertHtmlToMarkdown."),
    bytes: z.number().describe("Size of the clean HTML in bytes."),
    preview: z.string().describe("First characters of the article text, for a quick sanity check."),
  }),
);

export function createWebDocTransferExecutor(
  io: WebFileIO = localWebFileIO,
): ToolExecutor<WebDocTransferInput> {
  return async (input) => {
    const url = parseHttpUrl(input.url);
    const html = await io.read(input.file_path);
    const { document } = parseHTML(html);
    const base = document.createElement("base");
    base.setAttribute("href", url.href);
    document.head?.appendChild(base);

    const article = new Readability(document as unknown as Document).parse();
    if (!article?.content || !article.textContent?.trim()) {
      throw new Error("Unable to extract an article from the HTML document");
    }

    const title = article.title?.trim() || "Untitled article";
    const saved = await io.save({
      name: `${safeWebFileName(title)}.article.html`,
      mediaType: "text/html",
      content: article.content,
    });

    return {
      type: "json",
      payload: {
        title,
        file_path: saved.file_path,
        bytes: article.content.length,
        preview: (article.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, previewLength),
      },
    };
  };
}

export const webDocTransferExecutor = createWebDocTransferExecutor();

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

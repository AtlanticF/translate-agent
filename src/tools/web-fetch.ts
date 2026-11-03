import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";
import { localWebFileIO, safeWebFileName, type WebFileIO } from "./web-io.js";

export type WebFetchInput = {
  url: string;
};

export type WebFetchOutput = {
  url: string;
  file_path: string;
  title: string;
  bytes: number;
  preview: string;
};

const previewLength = 200;

const description = `Fetch a public web article over HTTP or HTTPS.

Use this tool before extracting an article. It validates that the URL is accessible and returns HTML, saves the raw HTML server-side, and returns its file_path plus a short preview. It does not extract the article body or convert HTML to Markdown. Pass the returned file_path (never the HTML contents) to the next tool.`;

const inputSchema = zodSchema(
  z.object({
    url: z.string().describe("HTTP or HTTPS URL of the web article to fetch."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    url: z.string().describe("Final URL after following redirects."),
    file_path: z.string().describe("Server-side path of the saved raw HTML. Pass this to webDocTransfer."),
    title: z.string().describe("Title of the fetched document."),
    bytes: z.number().describe("Size of the saved HTML in bytes."),
    preview: z.string().describe("First characters of the page text, for a quick sanity check."),
  }),
);

export function createWebFetchExecutor(
  fetchImpl: typeof fetch = fetch,
  io: WebFileIO = localWebFileIO,
): ToolExecutor<WebFetchInput> {
  return async (input) => {
    const url = parseHttpUrl(input.url);
    const response = await fetchImpl(url.href, { redirect: "follow" });
    const finalUrl = parseHttpUrl(response.url || url.href);

    if (!response.ok) {
      throw new Error(`Unable to fetch article: HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("text/html") && !contentType.startsWith("application/xhtml+xml")) {
      throw new Error(`Expected an HTML article but received ${contentType || "unknown content type"}`);
    }

    const html = await response.text();
    const saved = await io.save({
      name: `${htmlFileName(finalUrl)}.raw.html`,
      mediaType: "text/html",
      content: html,
    });

    return {
      type: "json",
      payload: {
        url: finalUrl.href,
        file_path: saved.file_path,
        title: htmlTitle(html) || finalUrl.hostname,
        bytes: html.length,
        preview: previewText(html),
      },
    };
  };
}

export const webFetchExecutor = createWebFetchExecutor();

export const webFetchTool = Object.assign(
  tool({
    description,
    inputSchema,
    outputSchema,
    execute: async (input) => {
      const result = await webFetchExecutor(input, { name: "WebFetch", callId: "WebFetch" });
      if (result.type !== "json" || !isObject(result.payload)) {
        throw new Error("WebFetch executor returned an unexpected result");
      }
      return result.payload as unknown as WebFetchOutput;
    },
  }),
  { name: "WebFetch" as const },
);

function htmlFileName(url: URL): string {
  const base = pathBasename(url.pathname);
  return safeWebFileName(base || url.hostname);
}

function pathBasename(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

function htmlTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim().slice(0, 200) : "";
}

function previewText(html: string): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, previewLength);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

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

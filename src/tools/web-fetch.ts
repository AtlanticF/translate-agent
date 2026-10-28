import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./executor.js";

export type WebFetchInput = {
  url: string;
};

export type WebFetchOutput = {
  url: string;
  html: string;
};

const description = `Fetch a public web article over HTTP or HTTPS.

Use this tool before extracting an article. It validates that the URL is accessible and returns HTML. It does not extract the article body or convert HTML to Markdown.`;

const inputSchema = zodSchema(
  z.object({
    url: z.string().describe("HTTP or HTTPS URL of the web article to fetch."),
  }),
);

const outputSchema = zodSchema(
  z.object({
    url: z.string().describe("Final URL after following redirects."),
    html: z.string().describe("Raw HTML returned by the final URL."),
  }),
);

export function createWebFetchExecutor(
  fetchImpl: typeof fetch = fetch,
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

    return {
      type: "json",
      payload: { url: finalUrl.href, html: await response.text() },
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

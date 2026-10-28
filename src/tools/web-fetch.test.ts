import { expect, test, vi } from "vitest";
import { createWebFetchExecutor, webFetchTool } from "./web-fetch.js";

const options = { name: "WebFetch", callId: "call-1" };

function htmlResponse(url = "https://example.com/article"): Response {
  const response = new Response("<html><body>Article</body></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

test("fetches HTML and returns the final URL", async () => {
  const fetchMock = vi.fn(async () => htmlResponse("https://example.com/final"));
  const execute = createWebFetchExecutor(fetchMock as unknown as typeof fetch);

  const result = await execute({ url: "https://example.com/start" }, options);

  expect(fetchMock).toHaveBeenCalledWith("https://example.com/start", { redirect: "follow" });
  expect(result).toEqual({
    type: "json",
    payload: {
      url: "https://example.com/final",
      html: "<html><body>Article</body></html>",
    },
  });
});

test("rejects non-HTTP URLs without fetching", async () => {
  const fetchMock = vi.fn();
  const execute = createWebFetchExecutor(fetchMock as unknown as typeof fetch);

  await expect(execute({ url: "file:///tmp/article.html" }, options)).rejects.toThrow(
    "url must be a valid HTTP or HTTPS URL",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects HTTP errors", async () => {
  const response = new Response("Not found", { status: 404 });
  const execute = createWebFetchExecutor(vi.fn(async () => response) as unknown as typeof fetch);

  await expect(execute({ url: "https://example.com/missing" }, options)).rejects.toThrow(
    "Unable to fetch article: HTTP 404",
  );
});

test("rejects non-HTML responses", async () => {
  const response = new Response("%PDF", {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
  const execute = createWebFetchExecutor(vi.fn(async () => response) as unknown as typeof fetch);

  await expect(execute({ url: "https://example.com/file.pdf" }, options)).rejects.toThrow(
    "Expected an HTML article but received application/pdf",
  );
});

test("propagates network failures", async () => {
  const execute = createWebFetchExecutor(
    vi.fn(async () => {
      throw new Error("network unavailable");
    }) as unknown as typeof fetch,
  );

  await expect(execute({ url: "https://example.com/article" }, options)).rejects.toThrow(
    "network unavailable",
  );
});

test("exposes the WebFetch tool name", () => {
  expect(webFetchTool.name).toBe("WebFetch");
});

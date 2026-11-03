import { expect, test, vi } from "vitest";
import { createWebFetchExecutor, webFetchTool } from "./web-fetch.js";
import type { WebFileIO } from "./web-io.js";

const options = { name: "WebFetch", callId: "call-1" };

function htmlResponse(url = "https://example.com/article"): Response {
  const response = new Response("<html><head><title>Article</title></head><body>Article body</body></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function memoryIO(): WebFileIO & { saved: Array<{ name: string; mediaType: string; content: string }> } {
  const saved: Array<{ name: string; mediaType: string; content: string }> = [];
  let index = 0;
  return {
    saved,
    async read() {
      throw new Error("unexpected read");
    },
    async save(input) {
      index += 1;
      saved.push(input);
      return { file_path: `/store/web-${index}` };
    },
  };
}

test("saves the fetched HTML server-side and returns its path with a preview", async () => {
  const io = memoryIO();
  const fetchMock = vi.fn(async () => htmlResponse("https://example.com/final"));
  const execute = createWebFetchExecutor(fetchMock as unknown as typeof fetch, io);

  const result = await execute({ url: "https://example.com/start" }, options);

  expect(fetchMock).toHaveBeenCalledWith("https://example.com/start", { redirect: "follow" });
  expect(io.saved).toEqual([
    {
      name: "final.raw.html",
      mediaType: "text/html",
      content: "<html><head><title>Article</title></head><body>Article body</body></html>",
    },
  ]);
  expect(result).toEqual({
    type: "json",
    payload: {
      url: "https://example.com/final",
      file_path: "/store/web-1",
      title: "Article",
      bytes: 73,
      preview: "Article body",
    },
  });
});

test("keeps whitespace out of the preview and strips markup", async () => {
  const io = memoryIO();
  const html =
    "<html><head><title>T</title><style>.x{color:red}</style></head><body><nav>Menu</nav><main>  Hello   <b>world</b></main></body></html>";
  const fetchMock = vi.fn(async () => {
    const response = new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    Object.defineProperty(response, "url", { value: "https://example.com/a" });
    return response;
  });
  const execute = createWebFetchExecutor(fetchMock as unknown as typeof fetch, io);

  const result = await execute({ url: "https://example.com/a" }, options);

  expect((result as { payload: { preview: string } } & { type: "json" }).payload.preview).toBe(
    "Menu Hello world",
  );
});

test("rejects non-HTTP URLs without fetching", async () => {
  const fetchMock = vi.fn();
  const execute = createWebFetchExecutor(fetchMock as unknown as typeof fetch, memoryIO());

  await expect(execute({ url: "file:///tmp/article.html" }, options)).rejects.toThrow(
    "url must be a valid HTTP or HTTPS URL",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects HTTP errors", async () => {
  const response = new Response("Not found", { status: 404 });
  const execute = createWebFetchExecutor(vi.fn(async () => response) as unknown as typeof fetch, memoryIO());

  await expect(execute({ url: "https://example.com/missing" }, options)).rejects.toThrow(
    "Unable to fetch article: HTTP 404",
  );
});

test("rejects non-HTML responses", async () => {
  const response = new Response("%PDF", {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
  const execute = createWebFetchExecutor(vi.fn(async () => response) as unknown as typeof fetch, memoryIO());

  await expect(execute({ url: "https://example.com/file.pdf" }, options)).rejects.toThrow(
    "Expected an HTML article but received application/pdf",
  );
});

test("propagates network failures", async () => {
  const execute = createWebFetchExecutor(
    vi.fn(async () => {
      throw new Error("network unavailable");
    }) as unknown as typeof fetch,
    memoryIO(),
  );

  await expect(execute({ url: "https://example.com/article" }, options)).rejects.toThrow(
    "network unavailable",
  );
});

test("exposes the WebFetch tool name", () => {
  expect(webFetchTool.name).toBe("WebFetch");
});

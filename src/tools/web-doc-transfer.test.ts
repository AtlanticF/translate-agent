import { expect, test } from "vitest";
import {
  createWebDocTransferExecutor,
  webDocTransferTool,
  type WebDocTransferOutput,
} from "./web-doc-transfer.js";
import type { WebFileIO } from "./web-io.js";

const options = { name: "webDocTransfer", callId: "call-1" };

const articleHtml = `<!doctype html>
<html>
  <head><title>Effective agents</title></head>
  <body>
    <nav>Navigation that should not be translated</nav>
    <main>
      <article>
        <h1>Effective agents</h1>
        <p>Long-running agents need a clear harness that helps them make steady progress across many context windows while preserving the original goal and verifying their work.</p>
        <p>They also need useful feedback and a way to recover from mistakes. <a href="/reference">Read the reference</a> for more detail about building reliable systems.</p>
        <ul><li>Plan the work</li><li>Verify the result</li></ul>
      </article>
    </main>
    <aside>Related advertisements</aside>
  </body>
</html>`;

function memoryIO(files: Record<string, string>): WebFileIO & { saved: Array<{ name: string; content: string }> } {
  const saved: Array<{ name: string; content: string }> = [];
  let index = 0;
  return {
    saved,
    async read(file_path) {
      const content = files[file_path];
      if (content === undefined) {
        throw new Error(`File not found: ${file_path}`);
      }
      return content;
    },
    async save(input) {
      index += 1;
      saved.push({ name: input.name, content: input.content });
      return { file_path: `/store/doc-${index}` };
    },
  };
}

test("reads saved HTML, extracts the article, and saves the clean HTML", async () => {
  const io = memoryIO({ "/store/web-1": articleHtml });
  const execute = createWebDocTransferExecutor(io);

  const result = await execute(
    { url: "https://example.com/blog/effective-agents", file_path: "/store/web-1" },
    options,
  );

  expect(result.type).toBe("json");
  const output = result.payload as WebDocTransferOutput;
  expect(output.title).toBe("Effective agents");
  expect(output.file_path).toBe("/store/doc-1");
  expect(output.preview).toContain("Long-running agents need a clear harness");
  expect(output.bytes).toBeGreaterThan(0);

  expect(io.saved).toHaveLength(1);
  expect(io.saved[0].name).toBe("Effective-agents.article.html");
  expect(io.saved[0].content).toContain("Long-running agents need a clear harness");
  expect(io.saved[0].content).toContain('<a href="https://example.com/reference">Read the reference</a>');
  expect(io.saved[0].content).not.toContain("Navigation that should not be translated");
  expect(io.saved[0].content).not.toContain("Related advertisements");
});

test("rejects HTML without an extractable article", async () => {
  const execute = createWebDocTransferExecutor(memoryIO({ "/store/empty": "<html><body></body></html>" }));

  await expect(
    execute({ url: "https://example.com", file_path: "/store/empty" }, options),
  ).rejects.toThrow("Unable to extract an article from the HTML document");
});

test("rejects invalid article URLs", async () => {
  const execute = createWebDocTransferExecutor(memoryIO({ "/store/web-1": articleHtml }));

  await expect(
    execute({ url: "not-a-url", file_path: "/store/web-1" }, options),
  ).rejects.toThrow("url must be a valid HTTP or HTTPS URL");
});

test("surfaces read failures for unknown file paths", async () => {
  const execute = createWebDocTransferExecutor(memoryIO({}));

  await expect(
    execute({ url: "https://example.com", file_path: "/store/missing" }, options),
  ).rejects.toThrow("File not found: /store/missing");
});

test("exposes the webDocTransfer tool name", () => {
  expect(webDocTransferTool.name).toBe("webDocTransfer");
});

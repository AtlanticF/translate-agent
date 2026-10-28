import { expect, test } from "vitest";
import {
  webDocTransferExecutor,
  webDocTransferTool,
  type WebDocTransferOutput,
} from "./web-doc-transfer.js";

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

test("extracts the article title and clean body HTML", async () => {
  const result = await webDocTransferExecutor(
    { url: "https://example.com/blog/effective-agents", html: articleHtml },
    options,
  );

  expect(result.type).toBe("json");
  const output = result.payload as WebDocTransferOutput;
  expect(output.title).toBe("Effective agents");
  expect(output.html).toContain("Long-running agents need a clear harness");
  expect(output.html).toContain('<a href="https://example.com/reference">Read the reference</a>');
  expect(output.html).not.toContain("Navigation that should not be translated");
  expect(output.html).not.toContain("Related advertisements");
});

test("rejects HTML without an extractable article", async () => {
  await expect(
    webDocTransferExecutor(
      { url: "https://example.com", html: "<html><body></body></html>" },
      options,
    ),
  ).rejects.toThrow("Unable to extract an article from the HTML document");
});

test("rejects invalid article URLs", async () => {
  await expect(
    webDocTransferExecutor({ url: "not-a-url", html: articleHtml }, options),
  ).rejects.toThrow("url must be a valid HTTP or HTTPS URL");
});

test("exposes the webDocTransfer tool name", () => {
  expect(webDocTransferTool.name).toBe("webDocTransfer");
});

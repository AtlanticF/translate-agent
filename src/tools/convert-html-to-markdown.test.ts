import { expect, test } from "vitest";
import {
  convertHtmlToMarkdownExecutor,
  convertHtmlToMarkdownTool,
} from "./convert-html-to-markdown.js";

const options = { name: "convertHtmlToMarkdown", callId: "call-1" };

test("converts article structures to Markdown", async () => {
  const result = await convertHtmlToMarkdownExecutor(
    {
      html: `<h1>Guide</h1><p>Hello <strong>world</strong>.</p><ul><li>First</li><li>Second</li></ul><p><a href="https://example.com/docs">Read more</a></p><pre><code>const ready = true;</code></pre>`,
    },
    options,
  );

  expect(result).toEqual({
    type: "json",
    payload: {
      markdown: `# Guide\n\nHello **world**.\n\n*   First\n*   Second\n\n[Read more](https://example.com/docs)\n\n\`\`\`\nconst ready = true;\n\`\`\``,
    },
  });
});

test("converts empty HTML to empty Markdown", async () => {
  const result = await convertHtmlToMarkdownExecutor({ html: "" }, options);

  expect(result).toEqual({ type: "json", payload: { markdown: "" } });
});

test("exposes the convertHtmlToMarkdown tool name", () => {
  expect(convertHtmlToMarkdownTool.name).toBe("convertHtmlToMarkdown");
});

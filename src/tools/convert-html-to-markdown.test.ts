import { expect, test } from "vitest";
import {
  createConvertHtmlToMarkdownExecutor,
  convertHtmlToMarkdownTool,
  type ConvertHtmlToMarkdownOutput,
} from "./convert-html-to-markdown.js";
import type { WebFileIO } from "./web-io.js";

const options = { name: "convertHtmlToMarkdown", callId: "call-1" };

const cleanHtml = `<h1>Guide</h1><p>Hello <strong>world</strong>.</p><ul><li>First</li><li>Second</li></ul><p><a href="https://example.com/docs">Read more</a></p><pre><code>const ready = true;</code></pre>`;

function memoryIO(files: Record<string, string>): WebFileIO & { saved: Array<{ name: string; mediaType: string; content: string }> } {
  const saved: Array<{ name: string; mediaType: string; content: string }> = [];
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
      saved.push({ name: input.name, mediaType: input.mediaType, content: input.content });
      return { file_path: `/store/markdown-${index}` };
    },
  };
}

test("reads clean HTML, converts it, and saves the Markdown server-side", async () => {
  const io = memoryIO({ "/store/doc-1": cleanHtml });
  const execute = createConvertHtmlToMarkdownExecutor(io);

  const result = await execute({ file_path: "/store/doc-1", file_path_out: "/tmp/guide.md" }, options);

  expect(result.type).toBe("json");
  const output = result.payload as ConvertHtmlToMarkdownOutput;
  expect(output.file_path).toBe("/store/markdown-1");
  expect(output.bytes).toBeGreaterThan(0);
  expect(output.preview.startsWith("# Guide Hello **world**.")).toBe(true);
  expect(io.saved).toEqual([
    {
      name: "/tmp/guide.md",
      mediaType: "text/markdown",
      content: `# Guide\n\nHello **world**.\n\n*   First\n*   Second\n\n[Read more](https://example.com/docs)\n\n\`\`\`\nconst ready = true;\n\`\`\``,
    },
  ]);
});

test("derives the output name from the input file when no suggestion is given", async () => {
  const io = memoryIO({ "/store/effective-agents.article.html": "<h1>Hi</h1><p>Body</p>" });
  const execute = createConvertHtmlToMarkdownExecutor(io);

  await execute({ file_path: "/store/effective-agents.article.html" }, options);

  expect(io.saved[0].name).toBe("effective-agents.article.md");
});

test("converts empty HTML to empty Markdown", async () => {
  const io = memoryIO({ "/store/doc-1": "" });
  const execute = createConvertHtmlToMarkdownExecutor(io);

  const result = await execute({ file_path: "/store/doc-1" }, options);

  expect(result).toEqual({
    type: "json",
    payload: { file_path: "/store/markdown-1", bytes: 0, preview: "" },
  });
  expect(io.saved[0].content).toBe("");
});

test("surfaces read failures for unknown file paths", async () => {
  const execute = createConvertHtmlToMarkdownExecutor(memoryIO({}));

  await expect(execute({ file_path: "/store/missing" }, options)).rejects.toThrow(
    "File not found: /store/missing",
  );
});

test("exposes the convertHtmlToMarkdown tool name", () => {
  expect(convertHtmlToMarkdownTool.name).toBe("convertHtmlToMarkdown");
});

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

// Web 工具链的文件读写抽象：HTML/Markdown 等大内容留在服务端，
// 模型只传递 file_path 引用，避免在 tool call 参数里回显大段内容。
export type WebFileIO = {
  read(file_path: string): Promise<string>;
  save(input: {
    name: string;
    mediaType: string;
    content: string;
  }): Promise<{ file_path: string }>;
};

export type SavedWebFile = {
  file_path: string;
  bytes: number;
};

// CLI 默认实现：中间 HTML 写入临时目录，Markdown 按建议名写入。
export const localWebFileIO: WebFileIO = {
  async read(file_path) {
    return readFile(file_path, "utf8");
  },
  async save({ name, content }) {
    const safe = safeWebFileName(name);
    const target = safe.endsWith(".md")
      ? path.join(tmpdir(), "translate-agent-web", safe)
      : path.join(tmpdir(), "translate-agent-web", intermediateName(safe, content));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return { file_path: target };
  },
};

// 同名中间产物按内容区分，重复抓取不会互相覆盖。
function intermediateName(name: string, content: string): string {
  const hash = createHash("sha1").update(content).digest("hex").slice(0, 12);
  const ext = path.extname(name) || ".html";
  return `${path.basename(name, ext)}-${hash}${ext}`;
}

export function safeWebFileName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || "article";
}

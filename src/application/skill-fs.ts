import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SkillDirEntry, SkillFs } from "../skills/fs.js";

/** CLI 的文件系统实现。路径由 node:path 拼接，可以是当前工作目录下的相对根。 */
export function createNodeSkillFs(): SkillFs {
  return {
    async readFile(filePath) {
      return readFile(filePath, "utf8");
    },
    async exists(filePath) {
      try {
        await stat(filePath);
        return true;
      } catch {
        return false;
      }
    },
    join(...parts) {
      return path.join(...parts);
    },
    dirname(filePath) {
      return path.dirname(filePath);
    },
    basename(filePath) {
      return path.basename(filePath);
    },
    async readDir(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.map(
        (entry): SkillDirEntry => ({
          name: entry.name,
          kind: entry.isDirectory() ? "directory" : "file",
        }),
      );
    },
  };
}

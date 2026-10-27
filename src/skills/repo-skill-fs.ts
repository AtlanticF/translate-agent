import type { SkillDirEntry, SkillFs } from "./fs.js";

export type RepoSkillsIndex = {
  root: string;
  files: readonly string[];
};

export type RepoSkillReadFile = (virtualPath: string) => Promise<string>;

export function parseRepoSkillsIndex(value: unknown): RepoSkillsIndex {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("skills index must be an object");
  }

  const record = value as Record<string, unknown>;
  const root = typeof record.root === "string" ? canonicalPath(record.root) : undefined;
  if (!root || root === "/") {
    throw new Error("skills index root must be an absolute path");
  }
  if (!Array.isArray(record.files)) {
    throw new Error("skills index files must be an array");
  }

  const prefix = `${root}/`;
  const files: string[] = [];
  const seen = new Set<string>();

  for (const item of record.files) {
    const file = typeof item === "string" ? canonicalPath(item) : undefined;
    if (!file || !file.startsWith(prefix)) {
      throw new Error(`skills index path is outside ${root}: ${String(item)}`);
    }
    if (seen.has(file)) {
      throw new Error(`skills index contains a duplicate path: ${file}`);
    }
    seen.add(file);
    files.push(file);
  }

  return { root, files };
}

export function createRepoSkillFs(index: RepoSkillsIndex, readFile: RepoSkillReadFile): SkillFs {
  const parsed = parseRepoSkillsIndex(index);
  const fileSet = new Set(parsed.files);
  const dirSet = new Set<string>([parsed.root]);

  for (const file of parsed.files) {
    let dir = dirnamePath(file);
    while (dir.length >= parsed.root.length) {
      dirSet.add(dir);
      if (dir === parsed.root) break;
      dir = dirnamePath(dir);
    }
  }

  return {
    readFile: async (path) => {
      const normalized = canonicalPath(path);
      if (!normalized || !fileSet.has(normalized)) {
        throw new Error(`File not found: ${path}`);
      }
      return readFile(normalized);
    },
    async exists(path) {
      const normalized = canonicalPath(path);
      return normalized !== undefined && (fileSet.has(normalized) || dirSet.has(normalized));
    },
    join: joinPaths,
    dirname: dirnamePath,
    basename: basenamePath,
    async readDir(path) {
      const normalized = canonicalPath(path);
      if (!normalized || !dirSet.has(normalized)) {
        throw new Error(`Directory not found: ${path}`);
      }

      const prefix = `${normalized}/`;
      const children = new Map<string, "file" | "directory">();

      for (const file of parsed.files) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const slash = rest.indexOf("/");
        const name = slash === -1 ? rest : rest.slice(0, slash);
        const kind = slash === -1 ? "file" : "directory";
        if (children.get(name) !== "directory") {
          children.set(name, kind);
        }
      }

      return [...children]
        .map(([name, kind]): SkillDirEntry => ({ name, kind }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
  };
}

function canonicalPath(value: string): string | undefined {
  if (!value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    return undefined;
  }

  const trimmed = value.length > 1 ? value.replace(/\/+$/, "") : value;
  if (trimmed === "/") return "/";

  const segments = trimmed.slice(1).split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return undefined;
  }
  return trimmed;
}

function joinPaths(...parts: string[]): string {
  const joined = parts.filter((part) => part.length > 0).join("/");
  if (joined.length === 0) return ".";

  const absolute = joined.startsWith("/");
  const segments: string[] = [];

  for (const segment of joined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0) {
        segments.pop();
      } else if (!absolute) {
        segments.push("..");
      }
      continue;
    }
    segments.push(segment);
  }

  const result = segments.join("/");
  if (absolute) return `/${result}`;
  return result.length > 0 ? result : ".";
}

function dirnamePath(value: string): string {
  if (value.length === 0) return ".";
  const trimmed = value.length > 1 ? value.replace(/\/+$/, "") : value;
  const index = trimmed.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/";
  return trimmed.slice(0, index);
}

function basenamePath(value: string): string {
  if (value.length === 0) return "";
  const trimmed = value.length > 1 ? value.replace(/\/+$/, "") : value;
  if (trimmed === "/") return "";
  const index = trimmed.lastIndexOf("/");
  return index === -1 ? trimmed : trimmed.slice(index + 1);
}

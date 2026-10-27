import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const skillsDirectory = ".skills";
const skillsRoot = "/.skills";
const defaultIndexPath = "src/skills/repo-index.json";

export function collectSkillsIndex(repoRoot) {
  const directory = path.join(repoRoot, skillsDirectory);
  const files = [];

  walk(directory, skillsRoot, files);
  files.sort();

  return { root: skillsRoot, files };
}

export function renderSkillsIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function checkSkillsIndex(repoRoot, indexPath = defaultIndexPath) {
  const target = path.join(repoRoot, indexPath);
  let committed;
  try {
    committed = readFileSync(target, "utf8");
  } catch {
    return false;
  }
  return committed === renderSkillsIndex(collectSkillsIndex(repoRoot));
}

function walk(directory, virtualDirectory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;

    const absolute = path.join(directory, entry.name);
    const virtual = `${virtualDirectory}/${entry.name}`;
    const stat = lstatSync(absolute);

    if (stat.isSymbolicLink()) {
      throw new Error(`skills 目录不允许符号链接: ${virtual}`);
    }
    if (stat.isDirectory()) {
      walk(absolute, virtual, files);
      continue;
    }
    if (!stat.isFile()) {
      throw new Error(`skills 目录只允许普通文件: ${virtual}`);
    }

    files.push(virtual);
  }
}

function main() {
  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const target = path.join(repoRoot, defaultIndexPath);

  if (process.argv.includes("--check")) {
    if (!checkSkillsIndex(repoRoot)) {
      console.error(
        `repo-index.json 与 ${skillsDirectory} 不一致，请运行 node scripts/sync-skills-index.mjs`,
      );
      process.exitCode = 1;
      return;
    }
    console.log("repo-index.json 已同步");
    return;
  }

  const rendered = renderSkillsIndex(collectSkillsIndex(repoRoot));
  mkdirSync(path.dirname(target), { recursive: true });
  if (readFileSyncIfExists(target) !== rendered) {
    writeFileSync(target, rendered);
  }
  console.log(`已写入 ${defaultIndexPath}`);
}

function readFileSyncIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

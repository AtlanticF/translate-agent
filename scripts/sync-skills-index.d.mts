export type RepoSkillsIndex = {
  root: string;
  files: string[];
};

export function collectSkillsIndex(repoRoot: string): RepoSkillsIndex;
export function renderSkillsIndex(index: RepoSkillsIndex): string;
export function checkSkillsIndex(repoRoot: string, indexPath?: string): boolean;

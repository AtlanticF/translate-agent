export type SkillDirEntry = {
  name: string;
  kind: "file" | "directory";
};

/**
 * skill 存储抽象。CLI 以后用文件系统，web 以后用内存或数据库。
 * 发现和校验只依赖这组方法，不出现 node:fs。
 * location 使用 join 产生的路径，可以是虚拟路径。
 */
export type SkillFs = {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  readDir(path: string): Promise<readonly SkillDirEntry[]>;
};

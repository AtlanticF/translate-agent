export const importedFilesMarker = "\n\nImported files:\n";

export const resumeMarker = "\n\nResume at:";

// 为一条用户消息附加导入文件列表；partial 提供时额外带上续翻位置提示，
// 帮助模型从第一个未翻译的单元继续，而不是从头重复翻译。
export function withImportedFiles(
  userInput: string,
  paths: readonly string[],
  partial?: { line: number; excerpt: string },
): string {
  let text = userInput;
  if (paths.length > 0) {
    text = `${text}${importedFilesMarker}${paths.join("\n")}`;
  }
  if (partial) {
    text = `${text}${resumeMarker} line ${partial.line} starts with "${partial.excerpt}". Continue translating from there; paragraphs before it are already translated — do not translate them again.`;
  }
  return text;
}

export function withoutImportedFiles(content: string, donePaths: ReadonlySet<string>): string {
  const index = content.lastIndexOf(importedFilesMarker);
  if (index < 0) {
    return content;
  }
  const head = content.slice(0, index);
  const paths = content.slice(index + importedFilesMarker.length).split("\n").filter(Boolean);
  const kept = paths.filter((path) => !donePaths.has(path));
  if (kept.length === paths.length) {
    return content;
  }
  if (kept.length === 0) {
    return head;
  }
  return `${head}${importedFilesMarker}${kept.join("\n")}`;
}

export function visibleUserText(content: string): string {
  const index = content.lastIndexOf(importedFilesMarker);
  return index < 0 ? content : content.slice(0, index);
}

export function omitDoneFilePaths<T extends { role: string; content: unknown }>(
  messages: readonly T[],
  donePaths: readonly string[],
): readonly T[] {
  if (donePaths.length === 0) {
    return messages;
  }
  const done = new Set(donePaths);
  let changed = false;
  const next = messages.map((message) => {
    if (message.role !== "user" || typeof message.content !== "string") {
      return message;
    }
    // 历史里的续翻提示随文件完成一并清掉，避免上下文里积累过期的行号。
    let content = withoutResumeHint(message.content);
    content = withoutImportedFiles(content, done);
    if (content === message.content) {
      return message;
    }
    changed = true;
    return { ...message, content };
  });
  return changed ? next : messages;
}

function withoutResumeHint(content: string): string {
  const index = content.lastIndexOf(resumeMarker);
  return index < 0 ? content : content.slice(0, index);
}

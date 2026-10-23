export const importedFilesMarker = "\n\nImported files:\n";

export function withImportedFiles(userInput: string, paths: readonly string[]): string {
  if (paths.length === 0) {
    return userInput;
  }
  return `${userInput}${importedFilesMarker}${paths.join("\n")}`;
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
    const content = withoutImportedFiles(message.content, done);
    if (content === message.content) {
      return message;
    }
    changed = true;
    return { ...message, content };
  });
  return changed ? next : messages;
}

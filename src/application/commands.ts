export type CommandName = "exit" | "compact" | "memory";

export type Command = {
  name: CommandName;
  description: string;
};

export const commands: readonly Command[] = [
  { name: "exit", description: "Exit" },
  { name: "compact", description: "Compact the conversation" },
  { name: "memory", description: "Show stored memory" },
];

export function commandQuery(text: string): string | undefined {
  if (!text.startsWith("/")) {
    return undefined;
  }
  return text.slice(1).trim();
}

export function lookupCommand(text: string): Command | undefined {
  const query = commandQuery(text);
  if (query === undefined || query.includes(" ")) {
    return undefined;
  }
  return commands.find((command) => command.name === query);
}

export function commandsForInput(text: string): readonly Command[] {
  return commandQuery(text) === undefined ? [] : commands;
}

// 只输入 / 或一个前缀时，用当前高亮的指令。完整名字优先。对不上的原样交回去。
export function commandToSubmit(text: string, selected: number): string {
  const exact = lookupCommand(text);
  if (exact) {
    return `/${exact.name}`;
  }
  const query = commandQuery(text);
  if (query === undefined) {
    return text.trim();
  }
  const matches = commands.filter((command) => command.name.startsWith(query));
  const command = matches[selected] ?? matches[0];
  if (!command) {
    return text.trim();
  }
  return `/${command.name}`;
}

export function nextCommandIndex(
  current: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) {
    return 0;
  }
  const step = direction === "up" ? -1 : 1;
  return (current + step + count) % count;
}

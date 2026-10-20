import { readFile, writeFile } from "node:fs/promises";
import { generateText } from "ai";
import { models } from "../ai/llm.js";
import {
  SYSTEM_MEMORY,
  type CopilotRequest,
  type CopilotResponse,
} from "../prompts/system.memory.js";

const defaultFilePath = "./memory.json";

export type MemoryItem = {
  index: number;
  text: string;
  tags: string[];
};

export type MemoryOp = MemoryItem & {
  action: "add" | "update" | "delete";
};

export type MemorySource = {
  provideMemory(): string;
  extractMemory(input: {
    req: CopilotRequest;
    res: CopilotResponse;
  }): Promise<void>;
};

export class Memory implements MemorySource {
  current: MemoryItem[] = [];

  constructor(private readonly filePath = defaultFilePath) {}

  async init(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      this.current = isMemoryList(parsed) ? parsed : [];
    } catch {
      this.current = [];
    }
  }

  applyOps(ops: readonly MemoryOp[]): void {
    for (const op of ops) {
      if (op.action === "add") {
        this.current.push({
          index: this.current.length,
          text: op.text,
          tags: op.tags,
        });
        continue;
      }

      if (op.action === "delete") {
        this.current = this.current.filter((item) => item.index !== op.index);
        continue;
      }

      const position = this.current.findIndex((item) => item.index === op.index);
      if (position === -1) {
        continue;
      }
      this.current[position] = {
        index: position,
        text: op.text,
        tags: op.tags,
      };
    }
  }

  async save(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(this.current, null, 2));
  }

  provideMemory(): string {
    return this.current
      .map((item) => `${item.text} (${item.tags.join(",")})`)
      .join("\n");
  }

  async extractMemory({
    req,
    res,
  }: {
    req: CopilotRequest;
    res: CopilotResponse;
  }): Promise<void> {
    try {
      const result = await generateText({
        model: models.memory,
        prompt: SYSTEM_MEMORY({
          req,
          res,
          currentMemory: JSON.stringify(this.current),
        }),
      });
      this.applyOps(parseMemoryOps(result.text));
      await this.save();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to parse memory: ${message}`);
    }
  }
}

function parseMemoryOps(text: string): MemoryOp[] {
  const parsed = lastOpsPayload(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("ops" in parsed) ||
    !Array.isArray(parsed.ops)
  ) {
    throw new Error("memory response has no ops");
  }

  return parsed.ops.map((op) => {
    if (!isMemoryOp(op)) {
      throw new Error("memory response has an invalid op");
    }
    return op;
  });
}

function lastOpsPayload(text: string): unknown {
  const objects = jsonObjects(text.replace(/```(?:json)?/g, ""));
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    try {
      const parsed: unknown = JSON.parse(objects[index] ?? "");
      if (hasOps(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  throw new Error("memory response has no JSON object");
}

function hasOps(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "ops" in value &&
    Array.isArray(value.ops)
  );
}

function jsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function isMemoryList(value: unknown): value is MemoryItem[] {
  return Array.isArray(value) && value.every(isMemoryItem);
}

function isMemoryOp(value: unknown): value is MemoryOp {
  if (!isMemoryItem(value) || typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "action" in value &&
    (value.action === "add" || value.action === "update" || value.action === "delete")
  );
}

function isMemoryItem(value: unknown): value is MemoryItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Partial<MemoryItem>;
  return (
    typeof item.index === "number" &&
    typeof item.text === "string" &&
    Array.isArray(item.tags) &&
    item.tags.every((tag) => typeof tag === "string")
  );
}

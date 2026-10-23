import { writeFile } from "node:fs/promises";
import type { ModelMessage } from "ai";
import { AgentLoop } from "../agent/agent-loop.js";
import { Context } from "../messages/context.js";
import { Memory } from "../memory/memory.js";
import { lsExecutor, lsTool } from "../tools/ls-tool.js";
import { createReadExecutor, readExecutor, readTool } from "../tools/read-tool.js";
import {
  createTranslateExecutor,
  translateTool,
  type TranslateReader,
  type TranslateWriter,
} from "../tools/translate-tool.js";

export async function createSession(): Promise<{
  loop: AgentLoop;
  context: Context;
  memory: Memory;
}> {
  const context = new Context();
  const memory = new Memory();
  await memory.init();

  const loop = new AgentLoop(
    {
      LS: lsTool,
      Read: readTool,
      Translate: translateTool,
    },
    toolExecutors(),
    context,
    { memory },
  );

  return { loop, context, memory };
}

export type LoopIO = {
  read?: TranslateReader;
  write?: TranslateWriter;
};

export async function createLoop(
  messages: readonly ModelMessage[] = [],
  io: LoopIO = {},
): Promise<AgentLoop> {
  const memory = new Memory();
  await memory.init();
  return new AgentLoop(
    {
      LS: lsTool,
      Read: readTool,
      Translate: translateTool,
    },
    toolExecutors(io),
    messages,
    { memory },
  );
}

function toolExecutors(io: LoopIO = {}) {
  return {
    LS: lsExecutor,
    Read: io.read ? createReadExecutor(io.read) : readExecutor,
    Translate: createTranslateExecutor({
      writer: io.write ?? writeTranslation,
      read: io.read,
    }),
  };
}

async function writeTranslation({
  contents,
  file_path,
}: {
  contents: string;
  file_path: string;
}): Promise<void> {
  await writeFile(file_path, contents);
}

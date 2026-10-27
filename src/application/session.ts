import { writeFile } from "node:fs/promises";
import type { ModelMessage } from "ai";
import { AgentLoop } from "../agent/agent-loop.js";
import { Context } from "../messages/context.js";
import { Memory } from "../memory/memory.js";
import type { SkillDirEntry } from "../skills/fs.js";
import { createLsExecutor, lsExecutor, lsTool } from "../tools/ls-tool.js";
import { createReadExecutor, readExecutor, readTool } from "../tools/read-tool.js";
import {
  createTranslateExecutor,
  translateTool,
  type TranslateReader,
  type TranslateWriter,
} from "../tools/translate-tool.js";

export async function createSession(
  options: { skillsPrompt?: string } = {},
): Promise<{
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
    { memory, skillsPrompt: options.skillsPrompt },
  );

  return { loop, context, memory };
}

export type LoopIO = {
  read?: TranslateReader;
  write?: TranslateWriter;
  ls?: (path: string) => Promise<readonly SkillDirEntry[]>;
};

export type LoopOptions = {
  skillsPrompt?: string;
};

export async function createLoop(
  messages: readonly ModelMessage[] = [],
  io: LoopIO = {},
  options: LoopOptions = {},
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
    { memory, skillsPrompt: options.skillsPrompt },
  );
}

function toolExecutors(io: LoopIO = {}) {
  return {
    LS: io.ls ? createLsExecutor(io.ls) : lsExecutor,
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

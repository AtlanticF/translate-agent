import { writeFile } from "node:fs/promises";
import { AgentLoop } from "../agent/agent-loop.js";
import { Context } from "../messages/context.js";
import { Memory } from "../memory/memory.js";
import { lsExecutor, lsTool } from "../tools/ls-tool.js";
import { readExecutor, readTool } from "../tools/read-tool.js";
import { createTranslateExecutor, translateTool } from "../tools/translate-tool.js";

export async function createSession(): Promise<{ loop: AgentLoop; context: Context }> {
  const context = new Context();
  const memory = new Memory();
  await memory.init();

  const loop = new AgentLoop(
    {
      LS: lsTool,
      Read: readTool,
      Translate: translateTool,
    },
    {
      LS: lsExecutor,
      Read: readExecutor,
      Translate: createTranslateExecutor({ writer: writeTranslation }),
    },
    context,
    { memory },
  );

  return { loop, context };
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

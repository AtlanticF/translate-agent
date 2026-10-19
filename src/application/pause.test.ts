import { expect, test, vi } from "vitest";
import type { AgentLoopNext } from "../agent/agent-loop.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { runUntilPause } from "./pause.js";

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/note.txt",
  tool: { name: "Translate", callId: "call-1" },
};

test("stops when the next actor is the user", async () => {
  const loop = script([step("user")]);

  await expect(runUntilPause(loop)).resolves.toEqual({ kind: "user" });
  expect(loop.next).toHaveBeenCalledTimes(1);
});

test("stops on a copilot request before following the agent actor", async () => {
  const loop = script([step("agent", [request])]);

  await expect(runUntilPause(loop)).resolves.toEqual({
    kind: "copilot",
    requests: [request],
  });
  expect(loop.next).toHaveBeenCalledTimes(1);
});

test("reports each step before deciding to pause", async () => {
  const seen: string[] = [];
  const loop = script([step("agent"), step("user")]);

  await runUntilPause(loop, (current) => {
    seen.push(current.nextActor);
  });

  expect(seen).toEqual(["agent", "user"]);
});

test("keeps stepping while the agent has no copilot request", async () => {
  const loop = script([step("agent"), step("agent"), step("user")]);

  await expect(runUntilPause(loop)).resolves.toEqual({ kind: "user" });
  expect(loop.next).toHaveBeenCalledTimes(3);
});

function script(steps: AgentLoopNext[]) {
  return {
    next: vi.fn(async () => {
      const nextStep = steps.shift();
      if (!nextStep) {
        throw new Error("scripted loop ran out of steps");
      }
      return nextStep;
    }),
  };
}

function step(nextActor: AgentLoopNext["nextActor"], copilotRequests: CopilotRequest[] = []): AgentLoopNext {
  return {
    nextActor,
    unprocessedToolCalls: [],
    copilotRequests,
    messages: [],
  };
}

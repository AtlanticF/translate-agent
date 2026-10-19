import { PassThrough } from "node:stream";
import { render, renderToString } from "ink";
import type { ReactElement } from "react";
import { expect, test } from "vitest";
import type { AgentLoopNext } from "../agent/agent-loop.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { App, submitCopilotReview, submitUserText, type AppSession } from "./entry.js";
import { inputPlaceholder } from "./user-screen.js";

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/note.txt",
  tool: { name: "Translate", callId: "call-1" },
};

test("shows a running state until the loop pauses", () => {
  const output = renderToString(<App start={() => new Promise(() => {})} />);

  expect(output).toContain("正在准备");
});

test("shows the user screen when the loop waits for input", async () => {
  let markReady = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const output = await renderFrame(
    <App
      start={async () =>
        session({
          async getMessages() {
            markReady();
            return [{ role: "user", content: "翻译 README" }];
          },
        })
      }
    />,
    ready,
  );

  expect(output).toContain("用户 翻译 README");
  expect(output).toContain(inputPlaceholder);
});

test("shows the copilot screen when a review is waiting", async () => {
  let markReady = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const output = await renderFrame(
    <App
      start={async () =>
        session({
          async next() {
            markReady();
            return step("agent", [request]);
          },
        })
      }
    />,
    ready,
  );

  expect(output).toContain("原文");
  expect(output).toContain("译文");
  expect(output).toContain("hello");
  expect(output).toContain("你好");
  expect(output).toContain("1/1");
  expect(output).toContain("a");
});

test("shows a startup error", async () => {
  let markReady = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const output = await renderFrame(
    <App
      start={async () => {
        markReady();
        throw new Error("disk full");
      }}
    />,
    ready,
  );

  expect(output).toContain("出错: disk full");
});

test("user submit records the message before the loop continues", async () => {
  const events: string[] = [];
  const current = session({
    async userInput(messages) {
      events.push(`input:${String(messages[0]?.content)}`);
    },
    async next() {
      events.push("next");
      return step("user");
    },
  });

  await expect(submitUserText(current, "你好")).resolves.toEqual({ kind: "user" });
  expect(events).toEqual(["input:你好", "next"]);
});

test("copilot submit stores the review before the loop continues", async () => {
  const events: string[] = [];
  const current = session({
    async next() {
      events.push("next");
      return step("user");
    },
  });
  current.context.addCopilotResponses = () => {
    events.push("saved");
  };

  await expect(
    submitCopilotReview(current, [{ status: "approve", tool: { callId: "call-1" } }]),
  ).resolves.toEqual({ kind: "user" });
  expect(events).toEqual(["saved", "next"]);
});

async function renderFrame(node: ReactElement, ready: Promise<void>): Promise<string> {
  const stdout = new PassThrough();
  let output = "";
  stdout.on("data", (chunk: Buffer | string) => {
    output += chunk.toString();
  });
  const instance = render(node, {
    stdout,
    stdin: rawStdin(),
    stderr: new PassThrough(),
    exitOnCtrlC: false,
    patchConsole: false,
    interactive: false,
  });

  try {
    await ready;
    await new Promise((resolve) => setImmediate(resolve));
    await instance.waitUntilRenderFlush();
  } finally {
    instance.unmount();
  }
  await instance.waitUntilExit();
  return output;
}

function rawStdin(): PassThrough {
  const stdin = new PassThrough();
  return Object.assign(stdin, {
    isTTY: true,
    setRawMode() {
      return stdin;
    },
  });
}

function session(overrides: Partial<AppSession["loop"]> = {}): AppSession {
  return {
    loop: {
      async next() {
        return step("user");
      },
      async userInput() {},
      async getMessages() {
        return [];
      },
      ...overrides,
    },
    context: {
      addCopilotResponses() {},
    },
  };
}

function step(
  nextActor: AgentLoopNext["nextActor"],
  copilotRequests: CopilotRequest[] = [],
): AgentLoopNext {
  return {
    nextActor,
    unprocessedToolCalls: [],
    copilotRequests,
    messages: [],
  };
}

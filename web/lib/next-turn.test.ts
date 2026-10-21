import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AgentLoopNext } from "../../src/agent/agent-loop";
import type { CopilotRequest } from "../../src/prompts/system.memory";
import { postNext } from "./next-turn";
import { createSessionManager } from "./session-manager";

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/readme",
  tool: { name: "Translate", callId: "call-1" },
};

test("returns 404 when the session id is unknown", async () => {
  const sessions = createSessionManager();

  const result = await postNext({ sessionId: "missing" }, undefined, sessions, async () => {
    throw new Error("should not open an agent");
  });

  expect(result).toEqual({ status: 404, body: { error: "session not found" } });
});

test("restores a session and saves the finished step", async () => {
  const sessions = createSessionManager();
  const created = sessions.createSession();
  sessions.addMessages(created.id, [{ role: "user", content: "earlier" }]);

  const result = await postNext(
    { sessionId: created.id, userInput: "hello" },
    undefined,
    sessions,
    async (messages) => {
      const stored = [...messages];
      return {
        async userInput(next) {
          stored.push(...next);
        },
        addCopilotResponses() {},
        setCopilotHandler() {},
        async next() {
          const message = { role: "assistant" as const, content: "done" };
          stored.push(message);
          const step: AgentLoopNext = {
            nextActor: "user",
            messages: [message],
            copilotRequests: [],
            unprocessedToolCalls: [],
          };
          return step;
        },
        async getMessages() {
          return stored;
        },
      };
    },
  );

  expect(result.status).toBe(200);
  expect(sessions.getSession(created.id)?.messages).toEqual([
    { role: "user", content: "earlier" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "done" },
  ]);
});

test("returns a copilot request before the step finishes", async () => {
  const sessions = createSessionManager();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const result = await postNext({}, undefined, sessions, async () => ({
    async userInput() {},
    addCopilotResponses() {},
    setCopilotHandler(handler) {
      void handler(request).catch(() => {});
    },
    async next() {
      await gate;
      const step: AgentLoopNext = {
        nextActor: "user",
        messages: [{ role: "assistant", content: "late" }],
        copilotRequests: [],
        unprocessedToolCalls: [],
      };
      return step;
    },
    async getMessages() {
      return [{ role: "assistant", content: "draft" }];
    },
  }));

  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    agentResponse: {
      messages: [{ role: "assistant", content: "draft" }],
      nextActor: "agent",
      copilotRequests: [request],
    },
  });
  const sessionId = "sessionId" in result.body ? result.body.sessionId : "";
  expect(sessions.getSession(sessionId)?.messages).toEqual([
    { role: "assistant", content: "draft" },
  ]);

  release();
  await gate;
});

import { expect, test } from "vitest";
import type { AgentLoopNext } from "../../src/agent/agent-loop";
import type { CopilotRequest } from "../../src/prompts/system.memory";
import { postNext } from "./next-turn";
import { createSqliteSessionStore } from "./session-sqlite";

const request: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/readme",
  tool: { name: "Translate", callId: "call-1" },
};

const userId = "user-a";

test("returns 404 when the session id is unknown", async () => {
  const sessions = createSqliteSessionStore();

  const result = await postNext(userId, { sessionId: "missing" }, undefined, sessions, async () => {
    throw new Error("should not open an agent");
  });

  expect(result).toEqual({ status: 404, body: { error: "session not found" } });
});

test("returns 404 for another user's session without opening the agent", async () => {
  const sessions = createSqliteSessionStore();
  const created = await sessions.create("user-b");

  const result = await postNext(
    userId,
    { sessionId: created.id },
    undefined,
    sessions,
    async () => {
      throw new Error("should not open an agent");
    },
  );

  expect(result).toEqual({ status: 404, body: { error: "session not found" } });
});

test("restores a session and saves the finished step", async () => {
  const sessions = createSqliteSessionStore();
  const created = await sessions.create(userId);
  await sessions.update(userId, created.id, {
    messages: [{ role: "user", content: "earlier" }],
  });

  const result = await postNext(
    userId,
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
  expect((await sessions.get(userId, created.id))?.messages).toEqual([
    { role: "user", content: "earlier" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "done" },
  ]);
});

test("returns a single step, even when the agent still has work", async () => {
  const sessions = createSqliteSessionStore();
  let calls = 0;

  const result = await postNext(userId, {}, undefined, sessions, async () => ({
    async userInput() {},
    addCopilotResponses() {},
    async next() {
      calls += 1;
      const step: AgentLoopNext = {
        nextActor: "agent",
        messages: [{ role: "assistant", content: "draft" }],
        copilotRequests: [request],
        unprocessedToolCalls: [],
      };
      return step;
    },
  }));

  expect(calls).toBe(1);
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    agentResponse: {
      messages: [{ role: "assistant", content: "draft" }],
      nextActor: "agent",
      copilotRequests: [request],
    },
  });
  const sessionId = "sessionId" in result.body ? result.body.sessionId : "";
  expect((await sessions.get(userId, sessionId))?.messages).toEqual([
    { role: "assistant", content: "draft" },
  ]);
  expect(await sessions.get("user-b", sessionId)).toBeUndefined();
});

test("tells the agent which files were imported", async () => {
  const sessions = createSqliteSessionStore();
  const created = await sessions.create(userId);
  let userText = "";

  await postNext(
    userId,
    { sessionId: created.id, userInput: "translate this" },
    undefined,
    sessions,
    async () => ({
      async userInput(messages) {
        const content = messages[0]?.content;
        userText = typeof content === "string" ? content : "";
      },
      addCopilotResponses() {},
      async next() {
        return {
          nextActor: "user",
          messages: [],
          copilotRequests: [],
          unprocessedToolCalls: [],
        };
      },
    }),
    {
      async list() {
        return [{ path: "/sessions/s/files/f/readme.md" }];
      },
    },
  );

  expect(userText).toBe("translate this\n\nImported files:\n/sessions/s/files/f/readme.md");
});

test("drops finished files from the next message and from earlier context", async () => {
  const sessions = createSqliteSessionStore();
  const created = await sessions.create(userId);
  await sessions.update(userId, created.id, {
    messages: [
      {
        role: "user",
        content:
          "translate this\n\nImported files:\n/sessions/s/files/done/a.txt\n/sessions/s/files/open/b.txt",
      },
    ],
  });
  const seen: string[] = [];

  await postNext(
    userId,
    { sessionId: created.id, userInput: "what next" },
    undefined,
    sessions,
    async (messages) => {
      for (const message of messages) {
        seen.push(typeof message.content === "string" ? message.content : "");
      }
      return {
        async userInput(next) {
          const content = next[0]?.content;
          seen.push(typeof content === "string" ? content : "");
        },
        addCopilotResponses() {},
        async next() {
          return {
            nextActor: "user",
            messages: [],
            copilotRequests: [],
            unprocessedToolCalls: [],
          };
        },
      };
    },
    {
      async list() {
        return [
          { path: "/sessions/s/files/done/a.txt", status: "done" as const },
          { path: "/sessions/s/files/open/b.txt", status: "open" as const },
        ];
      },
    },
  );

  expect(seen).toEqual([
    "translate this\n\nImported files:\n/sessions/s/files/open/b.txt",
    "what next\n\nImported files:\n/sessions/s/files/open/b.txt",
  ]);
  expect((await sessions.get(userId, created.id))?.messages).toEqual([
    {
      role: "user",
      content: "translate this\n\nImported files:\n/sessions/s/files/open/b.txt",
    },
    { role: "user", content: "what next\n\nImported files:\n/sessions/s/files/open/b.txt" },
  ]);
});

test("omits the file list once every imported file is finished", async () => {
  const sessions = createSqliteSessionStore();
  const created = await sessions.create(userId);
  await sessions.update(userId, created.id, {
    messages: [
      {
        role: "user",
        content: "translate this\n\nImported files:\n/sessions/s/files/done/a.txt",
      },
    ],
  });
  let userText = "";

  await postNext(
    userId,
    { sessionId: created.id, userInput: "thanks" },
    undefined,
    sessions,
    async () => {
      return {
        async userInput(next) {
          const content = next[0]?.content;
          userText = typeof content === "string" ? content : "";
        },
        addCopilotResponses() {},
        async next() {
          return {
            nextActor: "user",
            messages: [],
            copilotRequests: [],
            unprocessedToolCalls: [],
          };
        },
      };
    },
    {
      async list() {
        return [{ path: "/sessions/s/files/done/a.txt", status: "done" as const }];
      },
    },
  );

  expect(userText).toBe("thanks");
  expect((await sessions.get(userId, created.id))?.messages[0]).toEqual({
    role: "user",
    content: "translate this",
  });
});

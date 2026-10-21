import { expect, test } from "vitest";
import type { ClientTurn, ClientTurnBody } from "./client-loop";
import { runTurns } from "./client-loop";

const request = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/readme",
  tool: { name: "Translate", callId: "call-1" },
};

test("renders each step and continues with only the session id", async () => {
  const script: ClientTurn[] = [
    {
      sessionId: "s1",
      agentResponse: {
        messages: [{ role: "assistant", content: "calling read" }],
        nextActor: "agent",
        copilotRequests: [],
      },
    },
    {
      sessionId: "s1",
      agentResponse: {
        messages: [{ role: "assistant", content: "read result" }],
        nextActor: "agent",
        copilotRequests: [],
      },
    },
    {
      sessionId: "s1",
      agentResponse: {
        messages: [{ role: "assistant", content: "done" }],
        nextActor: "user",
        copilotRequests: [],
      },
    },
  ];
  const bodies: ClientTurnBody[] = [];
  const seen: string[] = [];

  await runTurns(
    async (body) => {
      bodies.push(body);
      const turn = script[bodies.length - 1];
      if (!turn) {
        throw new Error("too many turns");
      }
      return turn;
    },
    { sessionId: "s1", userInput: "translate" },
    (turn) => {
      const message = turn.agentResponse.messages[0];
      seen.push(typeof message?.content === "string" ? message.content : message?.role ?? "");
    },
  );

  expect(bodies).toEqual([
    { sessionId: "s1", userInput: "translate" },
    { sessionId: "s1" },
    { sessionId: "s1" },
  ]);
  expect(seen).toEqual(["calling read", "read result", "done"]);
});

test("stops when a step asks for review", async () => {
  let calls = 0;

  await runTurns(
    async () => {
      calls += 1;
      return {
        sessionId: "s1",
        agentResponse: {
          messages: [{ role: "assistant" as const, content: "draft" }],
          nextActor: "agent" as const,
          copilotRequests: [request],
        },
      };
    },
    { userInput: "hi" },
    () => {},
  );

  expect(calls).toBe(1);
});

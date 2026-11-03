import { afterEach, expect, test, vi } from "vitest";
import type { ClientLiveEvent, ClientTurn, ClientTurnBody } from "./client-loop";
import { postNextTurn, runTurns } from "./client-loop";

const request = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/readme",
  tool: { name: "Translate", callId: "call-1" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

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

test("stops when one step returns several reviews", async () => {
  const second = {
    ...request,
    src_string: "world",
    tool: { name: "Translate", callId: "call-2" },
  };
  let calls = 0;

  await runTurns(
    async () => {
      calls += 1;
      return {
        sessionId: "s1",
        agentResponse: {
          messages: [],
          nextActor: "agent" as const,
          copilotRequests: [request, second],
        },
      };
    },
    { userInput: "hi" },
    () => {},
  );

  expect(calls).toBe(1);
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

test("reads live events across arbitrary response chunks", async () => {
  const turn: ClientTurn = {
    sessionId: "s1",
    agentResponse: {
      messages: [{ role: "assistant", content: "done" }],
      nextActor: "user",
      copilotRequests: [],
    },
  };
  const encoded = new TextEncoder();
  const events = [
    { type: "start", sessionId: "s1" },
    { type: "text-delta", delta: "do" },
    { type: "activity", id: "call-1", kind: "tool", name: "Read", state: "running" },
    { type: "done", turn },
  ];
  const wire = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\r\n\r\n`)
    .join("");
  const fetchMock = vi.fn(async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.encode(wire.slice(0, 31)));
        controller.enqueue(encoded.encode(wire.slice(31, 97)));
        controller.enqueue(encoded.encode(wire.slice(97)));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const live: ClientLiveEvent[] = [];

  const result = await postNextTurn({ userInput: "go" }, (event) => live.push(event));

  expect(result).toEqual(turn);
  expect(live).toEqual(events.slice(0, 3));
  expect(fetchMock).toHaveBeenCalledWith("/next", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userInput: "go" }),
  });
});

test("surfaces an application error event", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const wire = 'event: error\ndata: {"type":"error","message":"model failed"}\n\n';
      return new Response(new TextEncoder().encode(wire), { status: 200 });
    }),
  );

  await expect(postNextTurn({ userInput: "go" })).rejects.toThrow("model failed");
});

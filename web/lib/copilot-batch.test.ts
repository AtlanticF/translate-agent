import { expect, test } from "vitest";
import type { CopilotRequest } from "../../src/prompts/system.memory";
import { noteCopilotDecision, readyCopilotResponses, type CopilotReviewResponse } from "./copilot-batch";

const first: CopilotRequest = {
  src_string: "hello",
  translate_string: "你好",
  file_path: "/tmp/a",
  tool: { name: "Translate", callId: "call-1" },
};

const second: CopilotRequest = {
  ...first,
  src_string: "world",
  translate_string: "世界",
  file_path: "/tmp/b",
  tool: { name: "Translate", callId: "call-2" },
};

const approve = (callId: string): CopilotReviewResponse => ({
  status: "approve",
  tool: { callId },
});

test("submits one review as soon as it is decided", () => {
  const noted = noteCopilotDecision([], {}, approve("call-1"));
  expect(noted.ready).toBeUndefined();

  const ready = noteCopilotDecision([first], {}, approve("call-1"));
  expect(ready.ready).toEqual([approve("call-1")]);
});

test("keeps partial decisions until the whole batch is ready", () => {
  const firstPass = noteCopilotDecision([second, first], {}, approve("call-1"));
  expect(firstPass.ready).toBeUndefined();
  expect(firstPass.decisions).toEqual({ "call-1": approve("call-1") });

  const reject: CopilotReviewResponse = {
    status: "reject",
    reason: "语气不对",
    tool: { callId: "call-2" },
  };
  const done = noteCopilotDecision([second, first], firstPass.decisions, reject);

  expect(done.ready).toEqual([reject, approve("call-1")]);
});

test("ignores a repeat decision and a call id outside the batch", () => {
  const decided = noteCopilotDecision([first, second], {}, approve("call-1"));
  const repeat = noteCopilotDecision([first, second], decided.decisions, {
    status: "reject",
    reason: "later",
    tool: { callId: "call-1" },
  });
  const outsider = noteCopilotDecision([first, second], decided.decisions, approve("call-9"));

  expect(repeat.decisions).toBe(decided.decisions);
  expect(outsider.decisions).toBe(decided.decisions);
  expect(readyCopilotResponses([first], { "call-1": approve("call-2") })).toBeUndefined();
});

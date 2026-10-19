import { expect, test } from "vitest";
import { Context } from "../messages/context.js";
import { AgentLoop } from "./agent-loop.js";

test("appends messages from the step before it returns", async () => {
  const context = new Context();
  const loop = new AgentLoop({}, {}, context);

  const result = await loop.next();

  expect(result.nextActor).toBe("agent");
  expect(result.messages).toEqual([]);
  expect(result.unprocessedToolCalls).toEqual([]);
  expect(result.copilotRequests).toEqual([]);
  expect(result.finishReason).toBeUndefined();
  expect(context.getMessages()).toEqual(result.messages);
});

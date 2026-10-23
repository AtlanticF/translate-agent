import { afterEach, expect, test } from "vitest";
import { cliSessionId, traceTool, withTrace } from "./langfuse.js";

const keys = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;

afterEach(() => {
  for (const key of keys) {
    delete process.env[key];
  }
});

test("keeps a turn working when Langfuse is not configured", async () => {
  for (const key of keys) {
    delete process.env[key];
  }

  await expect(withTrace("web", "session-1", async () => "ok")).resolves.toBe("ok");
  await expect(traceTool("Read", { path: "a.txt" }, async () => 1)).resolves.toBe(1);
  expect(cliSessionId()).toBe(cliSessionId());
});

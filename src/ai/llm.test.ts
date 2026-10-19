import { afterEach, expect, test } from "vitest";
import { models, openRouterModelIds, readOpenRouterApiKey } from "./llm.js";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
    return;
  }
  process.env.OPENROUTER_API_KEY = originalKey;
});

test("requires OPENROUTER_API_KEY", () => {
  expect(() => readOpenRouterApiKey({})).toThrow(/OPENROUTER_API_KEY/);
  expect(() => readOpenRouterApiKey({ OPENROUTER_API_KEY: "" })).toThrow(
    /OPENROUTER_API_KEY/,
  );
});

test("translator uses GLM 4.5 and memory uses Gemini 2.5 Flash", () => {
  process.env.OPENROUTER_API_KEY = "test-key";

  expect(models.translator.modelId).toBe(openRouterModelIds.translator);
  expect(models.memory.modelId).toBe(openRouterModelIds.memory);
  expect(openRouterModelIds.translator).toBe("z-ai/glm-4.5");
  expect(openRouterModelIds.memory).toBe("google/gemini-2.5-flash");
});

import { afterEach, expect, test } from "vitest";
import { models, openRouterModelIds, readOpenRouterApiKey } from "./llm.js";

const original = {
  key: process.env.OPENROUTER_API_KEY,
  translator: process.env.TRANSLATOR_MODEL,
  memory: process.env.MEMORY_MODEL,
};

afterEach(() => {
  restore("OPENROUTER_API_KEY", original.key);
  restore("TRANSLATOR_MODEL", original.translator);
  restore("MEMORY_MODEL", original.memory);
});

test("requires OPENROUTER_API_KEY", () => {
  expect(() => readOpenRouterApiKey({})).toThrow(/OPENROUTER_API_KEY/);
  expect(() => readOpenRouterApiKey({ OPENROUTER_API_KEY: "" })).toThrow(
    /OPENROUTER_API_KEY/,
  );
});

test("translator uses GLM 4.5 and memory uses Gemini 2.5 Flash", () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.TRANSLATOR_MODEL;
  delete process.env.MEMORY_MODEL;

  expect(models.translator.modelId).toBe(openRouterModelIds.translator);
  expect(models.memory.modelId).toBe(openRouterModelIds.memory);
  expect(openRouterModelIds.translator).toBe("z-ai/glm-4.5");
  expect(openRouterModelIds.memory).toBe("google/gemini-2.5-flash");
});

test("model names follow the environment", () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.TRANSLATOR_MODEL = "custom/translator";
  process.env.MEMORY_MODEL = "custom/memory";

  expect(models.translator.modelId).toBe("custom/translator");
  expect(models.memory.modelId).toBe("custom/memory");
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { defaultModelIds, loadEnvFile, readAppEnv } from "./env.js";

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

test("requires an API key", () => {
  expect(() => readAppEnv({})).toThrow(/OPENROUTER_API_KEY/);
  expect(() => readAppEnv({ OPENROUTER_API_KEY: "  " })).toThrow(/OPENROUTER_API_KEY/);
});

test("uses the current model names when they are not configured", () => {
  const config = readAppEnv({ OPENROUTER_API_KEY: "test-key" });

  expect(config.translatorModel).toBe(defaultModelIds.translator);
  expect(config.memoryModel).toBe(defaultModelIds.memory);
  expect(config.translatorModel).toBe("z-ai/glm-4.5");
  expect(config.memoryModel).toBe("google/gemini-2.5-flash");
});

test("reads model names from the environment", () => {
  const config = readAppEnv({
    OPENROUTER_API_KEY: "test-key",
    TRANSLATOR_MODEL: "custom/translator",
    MEMORY_MODEL: " custom/memory ",
  });

  expect(config.apiKey).toBe("test-key");
  expect(config.translatorModel).toBe("custom/translator");
  expect(config.memoryModel).toBe("custom/memory");
});

test("loads a missing env file as empty", () => {
  expect(() => loadEnvFile(join(tmpdir(), "missing.env"))).not.toThrow();
});

test("loads the API key and model names from a file", () => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.TRANSLATOR_MODEL;
  delete process.env.MEMORY_MODEL;
  const dir = mkdtempSync(join(tmpdir(), "translate-agent-"));
  const path = join(dir, ".env");
  writeFileSync(
    path,
    [
      "OPENROUTER_API_KEY=from-file",
      "TRANSLATOR_MODEL=file/translator",
      "MEMORY_MODEL=file/memory",
      "",
    ].join("\n"),
  );

  loadEnvFile(path);

  expect(readAppEnv()).toEqual({
    apiKey: "from-file",
    translatorModel: "file/translator",
    memoryModel: "file/memory",
  });
});

test("keeps an existing environment value over the file", () => {
  process.env.OPENROUTER_API_KEY = "from-shell";
  const dir = mkdtempSync(join(tmpdir(), "translate-agent-"));
  const path = join(dir, ".env");
  writeFileSync(path, "OPENROUTER_API_KEY=from-file\n");

  loadEnvFile(path);

  expect(process.env.OPENROUTER_API_KEY).toBe("from-shell");
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

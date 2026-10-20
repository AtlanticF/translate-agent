import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { openRouterBaseURL } from "./llm.js";
import { checkModels, ModelUnavailableError, startupFailureText } from "./probe.js";

const original = {
  key: process.env.OPENROUTER_API_KEY,
  translator: process.env.TRANSLATOR_MODEL,
  memory: process.env.MEMORY_MODEL,
  compact: process.env.COMPACT_MODEL,
};

afterEach(() => {
  restore("OPENROUTER_API_KEY", original.key);
  restore("TRANSLATOR_MODEL", original.translator);
  restore("MEMORY_MODEL", original.memory);
  restore("COMPACT_MODEL", original.compact);
});

test("accepts both models when the probe succeeds", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.TRANSLATOR_MODEL;
  delete process.env.MEMORY_MODEL;
  delete process.env.COMPACT_MODEL;
  const seen: string[] = [];

  await checkModels(
    async (model) => {
      seen.push(model.modelId);
    },
    { cachePath: await tempCache() },
  );

  expect(seen).toEqual(["z-ai/glm-4.5", "google/gemini-2.5-flash"]);
});

test("names the model that the probe rejects", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.TRANSLATOR_MODEL;
  delete process.env.MEMORY_MODEL;
  delete process.env.COMPACT_MODEL;

  const error = await checkModels(
    async (model) => {
      if (model.modelId === "google/gemini-2.5-flash") {
        throw new Error("long provider body that should stay hidden");
      }
    },
    { cachePath: await tempCache() },
  ).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(ModelUnavailableError);
  expect(error).toMatchObject({ modelIds: ["google/gemini-2.5-flash"] });
  expect((error as Error).message).toContain("模型不可用：google/gemini-2.5-flash");
  expect((error as Error).message).not.toContain("long provider body");
});

test("probes a shared model id once", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.TRANSLATOR_MODEL = "google/gemini-2.5-flash";
  process.env.MEMORY_MODEL = "google/gemini-2.5-flash";
  delete process.env.COMPACT_MODEL;
  let calls = 0;

  await checkModels(
    async () => {
      calls += 1;
    },
    { cachePath: await tempCache() },
  );

  expect(calls).toBe(1);
});

test("colors the startup failure red", () => {
  const text = startupFailureText(new ModelUnavailableError(["google/gemini-2.5-flash"]));

  expect(text.startsWith("\x1b[31m")).toBe(true);
  expect(text.endsWith("\x1b[0m")).toBe(true);
  expect(text).toContain("模型不可用：google/gemini-2.5-flash");
});

test("skips a model that passed within 24 hours", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.TRANSLATOR_MODEL;
  delete process.env.MEMORY_MODEL;
  delete process.env.COMPACT_MODEL;
  const cachePath = await tempCache();
  const now = Date.parse("2026-10-20T00:00:00.000Z");
  let calls = 0;

  await checkModels(
    async () => {
      calls += 1;
    },
    { cachePath, now: () => now },
  );
  await checkModels(
    async () => {
      calls += 1;
    },
    { cachePath, now: () => now + 60_000 },
  );

  expect(calls).toBe(2);
  expect(JSON.parse(await readFile(cachePath, "utf8"))).toEqual([
    {
      baseURL: openRouterBaseURL,
      model: "z-ai/glm-4.5",
      pass: true,
      checkedAt: "2026-10-20T00:00:00.000Z",
    },
    {
      baseURL: openRouterBaseURL,
      model: "google/gemini-2.5-flash",
      pass: true,
      checkedAt: "2026-10-20T00:00:00.000Z",
    },
  ]);
});

test("probes again after the cache expires", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.TRANSLATOR_MODEL = "google/gemini-2.5-flash";
  process.env.MEMORY_MODEL = "google/gemini-2.5-flash";
  delete process.env.COMPACT_MODEL;
  const cachePath = await tempCache();
  const start = Date.parse("2026-10-20T00:00:00.000Z");
  let calls = 0;
  const ping = async () => {
    calls += 1;
  };

  await checkModels(ping, { cachePath, now: () => start });
  await checkModels(ping, { cachePath, now: () => start + 24 * 60 * 60 * 1000 });

  expect(calls).toBe(2);
});

async function tempCache(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "model-cache-"));
  return join(directory, ".model-cache.json");
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

import { readFile, writeFile } from "node:fs/promises";
import { generateText } from "ai";
import { readAppEnv } from "../env.js";
import { models, openRouterBaseURL } from "./llm.js";

type OpenRouterModel = (typeof models)["translator"];

const red = "\x1b[31m";
const reset = "\x1b[0m";

export class ModelUnavailableError extends Error {
  readonly modelIds: readonly string[];

  constructor(modelIds: readonly string[]) {
    super(
      [
        ...modelIds.map((id) => `模型不可用：${id}`),
        "请检查模型名称、API key，或 OpenRouter 的地区限制。",
      ].join("\n"),
    );
    this.name = "ModelUnavailableError";
    this.modelIds = modelIds;
  }
}

type Ping = (model: OpenRouterModel) => Promise<void>;

const cacheFile = "./.model-cache.json";
const cacheTtlMs = 24 * 60 * 60 * 1000;

type ModelPass = {
  baseURL: string;
  model: string;
  pass: true;
  checkedAt: string;
};

type CheckOptions = {
  cachePath?: string;
  now?: () => number;
};

// AI SDK 没有探活接口。发一次最短生成，地区限制会在这里失败。
async function ping(model: OpenRouterModel): Promise<void> {
  await generateText({
    model,
    prompt: "ping",
    maxOutputTokens: 1,
    maxRetries: 0,
  });
}

export async function checkModels(
  pingModel: Ping = ping,
  { cachePath = cacheFile, now = Date.now }: CheckOptions = {},
): Promise<void> {
  const config = readAppEnv();
  const targets = [
    { id: config.translatorModel, model: models.translator },
    { id: config.memoryModel, model: models.memory },
    { id: config.compactModel, model: models.compact },
  ];
  const seen = new Set<string>();
  const unique = targets.filter((target) => {
    if (seen.has(target.id)) {
      return false;
    }
    seen.add(target.id);
    return true;
  });

  const checkedAt = now();
  const stored = await readCache(cachePath);
  const cached = stored.filter((entry) => fresh(entry, checkedAt));
  const passed = new Set(cached.map(cacheKey));
  const checked = await Promise.all(
    unique.map(async (target) => {
      const entry = { baseURL: openRouterBaseURL, model: target.id };
      if (passed.has(cacheKey(entry))) {
        return null;
      }
      try {
        await pingModel(target.model);
        return {
          ...entry,
          pass: true as const,
          checkedAt: new Date(checkedAt).toISOString(),
        };
      } catch {
        return target.id;
      }
    }),
  );
  const failed = checked.filter((item): item is string => typeof item === "string");
  const added = checked.filter((item): item is ModelPass => item !== null && typeof item !== "string");

  if (added.length > 0 || stored.length !== cached.length) {
    const kept = cached.filter((entry) => !added.some((item) => cacheKey(item) === cacheKey(entry)));
    await writeFile(cachePath, JSON.stringify([...kept, ...added], null, 2));
  }
  if (failed.length > 0) {
    throw new ModelUnavailableError(failed);
  }
}

function cacheKey(entry: { baseURL: string; model: string }): string {
  return `${entry.baseURL}\n${entry.model}`;
}

function fresh(entry: ModelPass, now: number): boolean {
  const checkedAt = Date.parse(entry.checkedAt);
  return entry.pass === true && Number.isFinite(checkedAt) && now - checkedAt < cacheTtlMs;
}

async function readCache(path: string): Promise<ModelPass[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isModelPass);
  } catch {
    return [];
  }
}

function isModelPass(value: unknown): value is ModelPass {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<ModelPass>;
  return (
    typeof entry.baseURL === "string" &&
    typeof entry.model === "string" &&
    entry.pass === true &&
    typeof entry.checkedAt === "string"
  );
}

export function startupFailureText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${red}${message}${reset}`;
}

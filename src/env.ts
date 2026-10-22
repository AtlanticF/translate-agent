import { existsSync } from "node:fs";

export const defaultModelIds = {
  translator: "z-ai/glm-4.5",
  memory: "google/gemini-2.5-flash",
  compact: "google/gemini-2.5-flash",
} as const;

export type AppEnv = {
  apiKey: string;
  translatorModel: string;
  memoryModel: string;
  compactModel: string;
};

export function loadEnvFile(path = ".env"): void {
  if (!existsSync(/* turbopackIgnore: true */ path)) {
    return;
  }
  process.loadEnvFile(/* turbopackIgnore: true */ path);
}

export function readAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 OPENROUTER_API_KEY，请把它写进 .env");
  }

  return {
    apiKey,
    translatorModel: modelName(env.TRANSLATOR_MODEL, defaultModelIds.translator),
    memoryModel: modelName(env.MEMORY_MODEL, defaultModelIds.memory),
    compactModel: modelName(env.COMPACT_MODEL, defaultModelIds.compact),
  };
}

function modelName(value: string | undefined, fallback: string): string {
  const name = value?.trim();
  return name ? name : fallback;
}

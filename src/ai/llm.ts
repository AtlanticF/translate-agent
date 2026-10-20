import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { readAppEnv } from "../env.js";

export const openRouterModelIds = {
  get translator() {
    return readAppEnv().translatorModel;
  },
  get memory() {
    return readAppEnv().memoryModel;
  },
};

export const openRouterBaseURL = "https://openrouter.ai/api/v1";

export function readOpenRouterApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readAppEnv(env).apiKey;
}

function openrouter(apiKey: string) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: openRouterBaseURL,
    apiKey,
  });
}

export const models = {
  get translator() {
    const config = readAppEnv();
    return openrouter(config.apiKey)(config.translatorModel);
  },
  get memory() {
    const config = readAppEnv();
    return openrouter(config.apiKey)(config.memoryModel);
  },
};

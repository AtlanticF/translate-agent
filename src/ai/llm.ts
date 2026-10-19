import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const openRouterModelIds = {
  translator: "z-ai/glm-4.5",
  memory: "google/gemini-2.5-flash",
} as const;

const openRouterBaseURL = "https://openrouter.ai/api/v1";

export function readOpenRouterApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required");
  }
  return apiKey;
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
    return openrouter(readOpenRouterApiKey())(openRouterModelIds.translator);
  },
  get memory() {
    return openrouter(readOpenRouterApiKey())(openRouterModelIds.memory);
  },
};

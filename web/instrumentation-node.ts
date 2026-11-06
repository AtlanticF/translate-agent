import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env";
import { startLangfuse } from "../src/observability/langfuse";

export async function registerNode(): Promise<void> {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
  loadEnvFile(envPath);
  startLangfuse();
}

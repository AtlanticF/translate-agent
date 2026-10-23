import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/env";

export async function register(): Promise<void> {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
  loadEnvFile(envPath);
  const { startLangfuse } = await import("../src/observability/langfuse");
  startLangfuse();
}

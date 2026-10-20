import { checkModels, startupFailureText } from "../ai/probe.js";
import { loadEnvFile } from "../env.js";

type StartupOptions = {
  loadEnv?: () => void;
  check?: () => Promise<void>;
  write?: (text: string) => void;
  exit?: (code: number) => never;
};

export async function startup(
  renderApp: () => void,
  {
    loadEnv = loadEnvFile,
    check = checkModels,
    write = console.error,
    exit = process.exit,
  }: StartupOptions = {},
): Promise<void> {
  loadEnv();
  try {
    await check();
  } catch (error) {
    write(startupFailureText(error));
    exit(1);
  }
  renderApp();
}

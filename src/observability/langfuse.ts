import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { registerTelemetry } from "ai";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

export type TraceSurface = "cli" | "web";

type LangfuseState = {
  started: boolean;
  processor?: LangfuseSpanProcessor;
  cliSessionId?: string;
};

const stateKey = Symbol.for("translate-agent.langfuse");

function state(): LangfuseState {
  const target = globalThis as typeof globalThis & { [stateKey]?: LangfuseState };
  target[stateKey] ??= { started: false };
  return target[stateKey];
}

export function startLangfuse(): void {
  const current = state();
  if (current.started) {
    return;
  }
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim();
  if (!publicKey || !secretKey || !baseUrl) {
    return;
  }

  const manager = new AsyncLocalStorageContextManager();
  manager.enable();
  context.setGlobalContextManager(manager);
  const processor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    exportMode: "immediate",
  });
  const provider = new BasicTracerProvider({ spanProcessors: [processor] });
  trace.setGlobalTracerProvider(provider);
  registerTelemetry(new LangfuseVercelAiSdkIntegration());
  current.processor = processor;
  current.started = true;
}

export async function flushLangfuse(): Promise<void> {
  await state().processor?.forceFlush();
}

export function cliSessionId(): string {
  const current = state();
  current.cliSessionId ??= crypto.randomUUID();
  return current.cliSessionId;
}

export async function withTrace<T>(
  surface: TraceSurface,
  sessionId: string,
  run: () => Promise<T>,
): Promise<T> {
  startLangfuse();
  if (!state().started) {
    return run();
  }

  try {
    return await propagateAttributes(
      {
        traceName: surface,
        sessionId,
        tags: [surface],
      },
      async () =>
        startActiveObservation(surface, async () => run(), { asType: "agent" }),
    );
  } finally {
    try {
      await flushLangfuse();
    } catch {
      // 上报失败不影响这一轮翻译。
    }
  }
}

export async function traceTool<T>(
  name: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!state().started) {
    return run();
  }

  return startActiveObservation(
    name,
    async (tool) => {
      tool.update({ input });
      try {
        const output = await run();
        tool.update({ output });
        return output;
      } catch (error) {
        tool.update({
          level: "ERROR",
          statusMessage: error instanceof Error ? error.message : String(error),
          output: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    { asType: "tool" },
  );
}

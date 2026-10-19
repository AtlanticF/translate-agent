import type { JSONValue } from "ai";

export type ToolExecutor<TInput = any, UOutput = JSONValue> = (
  input: TInput,
) => Promise<UOutput>;

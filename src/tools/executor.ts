import type { JSONValue } from "ai";
import type {
  CopilotRequest,
  CopilotResponse,
} from "../prompts/system.memory.js";

export type ToolExecutorOptions = {
  name: string;
  callId: string;
};

export type ToolExecutorResult =
  | { type: "json"; payload: JSONValue }
  | { type: "copilot-request"; payload: CopilotRequest };

export type ToolExecutor<TInput = any> = (
  input: TInput,
  options: ToolExecutorOptions,
  copilotResponse?: CopilotResponse,
) => Promise<ToolExecutorResult>;

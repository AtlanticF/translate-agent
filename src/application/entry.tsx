import { pathToFileURL } from "node:url";
import type { ModelMessage, UserModelMessage } from "ai";
import { render, Text, useApp } from "ink";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { AgentLoopNext } from "../agent/agent-loop.js";
import type { CopilotResponseEntry } from "../messages/context.js";
import type { ReviewExit } from "./copilot-screen.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { ActivityScreen } from "./activity-screen.js";
import { CompactScreen } from "./compact-screen.js";
import { MemoryScreen, type MemoryLine } from "./memory-screen.js";
import { CopilotScreen } from "./copilot-screen.js";
import { rememberReview, type Paragraph } from "./paragraphs.js";
import { runUntilPause, type Pause } from "./pause.js";
import { cliSessionId, withTrace } from "../observability/langfuse.js";
import { createSession } from "./session.js";
import { startup } from "./startup.js";
import { lookupCommand } from "./commands.js";
import { UserScreen } from "./user-screen.js";

export type AppSession = {
  loop: {
    next: (signal?: AbortSignal) => Promise<AgentLoopNext>;
    userInput: (messages: UserModelMessage[]) => Promise<void>;
    getMessages: () => Promise<ModelMessage[]>;
  };
  context: {
    addMessages: (messages: readonly ModelMessage[]) => void;
    addCopilotResponses: (responses: readonly CopilotResponseEntry[]) => void;
    compact: () => Promise<{ analysis: string; summary: string }>;
  };
  memory: {
    current: readonly MemoryLine[];
  };
};

type Screen =
  | { kind: "running"; messages: ModelMessage[]; processing: boolean }
  | { kind: "error"; message: string }
  | { kind: "user"; messages: ModelMessage[]; notice?: string }
  | { kind: "copilot"; requests: CopilotRequest[] }
  | { kind: "compact"; messages: ModelMessage[]; phase: "running" }
  | {
      kind: "compact";
      messages: ModelMessage[];
      phase: "done";
      analysis: string;
      summary: string;
      notice?: string;
    }
  | { kind: "memory"; messages: ModelMessage[]; items: readonly MemoryLine[]; notice?: string };

type AppProps = {
  start?: () => Promise<AppSession>;
};

export async function submitUserText(
  session: AppSession,
  text: string,
  onStep?: (step: AgentLoopNext) => void,
  signal?: AbortSignal,
): Promise<Pause> {
  await session.loop.userInput([{ role: "user", content: text }]);
  return runUntilPause(session.loop, onStep, signal);
}

export async function settleReview(
  session: AppSession,
  exit: ReviewExit,
): Promise<ModelMessage[]> {
  if (exit.failures) {
    session.context.addMessages([exit.failures]);
  }
  if (exit.kept.length > 0) {
    session.context.addCopilotResponses(exit.kept);
    await session.loop.next();
  }
  return session.loop.getMessages();
}

export async function submitCopilotReview(
  session: AppSession,
  responses: readonly CopilotResponseEntry[],
  onStep?: (step: AgentLoopNext) => void,
  signal?: AbortSignal,
): Promise<Pause> {
  session.context.addCopilotResponses(responses);
  return runUntilPause(session.loop, onStep, signal);
}

export function App({ start = createSession }: AppProps): ReactElement {
  const [screen, setScreen] = useState<Screen>({
    kind: "running",
    messages: [],
    processing: true,
  });
  const alive = useRef(true);
  const sessionRef = useRef<AppSession | undefined>(undefined);
  const [done, setDone] = useState<Paragraph[]>([]);
  const stopRef = useRef<AbortController | undefined>(undefined);
  const { exit } = useApp();

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    void boot();
    return () => {
      cancelled = true;
      alive.current = false;
    };

    async function boot(): Promise<void> {
      try {
        const session = await start();
        if (cancelled) {
          return;
        }
        sessionRef.current = session;
        const pause = await watch([], (onStep, signal) =>
          runUntilPause(session.loop, onStep, signal),
        );
        if (cancelled) {
          return;
        }
        await show(session, pause);
      } catch (error) {
        if (!cancelled) {
          setScreen({ kind: "error", message: errorText(error) });
        }
      }
    }
  }, [start]);

  // 运行中只展示过程，不挂输入，避免按键和外部编辑器抢终端。
  if (screen.kind === "running") {
    return (
      <ActivityScreen
        messages={screen.messages}
        processing={screen.processing}
        onStop={stopProcessing}
      />
    );
  }
  if (screen.kind === "error") {
    return <Text>出错: {screen.message}</Text>;
  }
  if (screen.kind === "memory") {
    return (
      <MemoryScreen
        messages={screen.messages}
        items={screen.items}
        notice={screen.notice}
        onSubmit={(text) => {
          if (text.startsWith("/")) {
            void runCommand(text);
            return;
          }
          void continueWith(submitUserText, text);
        }}
      />
    );
  }
  if (screen.kind === "compact") {
    return (
      <CompactScreen
        messages={screen.messages}
        notice={screen.phase === "done" ? screen.notice : undefined}
        result={
          screen.phase === "done"
            ? { analysis: screen.analysis, summary: screen.summary }
            : undefined
        }
        onSubmit={
          screen.phase === "done"
            ? (text) => {
                if (text.startsWith("/")) {
                  void runCommand(text);
                  return;
                }
                void continueWith(submitUserText, text);
              }
            : undefined
        }
      />
    );
  }
  if (screen.kind === "user") {
    return (
      <UserScreen
        messages={screen.messages}
        notice={screen.notice}
        onSubmit={(text) => {
          if (text.startsWith("/")) {
            void runCommand(text);
            return;
          }
          void continueWith(submitUserText, text);
        }}
      />
    );
  }
  return (
    <CopilotScreen
      done={done}
      requests={screen.requests}
      onSubmit={(responses) => {
        setDone((items) => rememberReview(items, screen.requests, responses));
        void continueWith(submitCopilotReview, responses);
      }}
      onEscape={(exit) => {
        void leaveReview(exit);
      }}
    />
  );

  async function runCommand(text: string): Promise<void> {
    const command = lookupCommand(text);
    if (!command) {
      const notice = `Unknown command: ${text}`;
      setScreen((current) => {
        if (
          current.kind === "user" ||
          current.kind === "memory" ||
          (current.kind === "compact" && current.phase === "done")
        ) {
          return { ...current, notice };
        }
        return current;
      });
      return;
    }
    if (command.name === "exit") {
      exit();
      return;
    }

    const session = sessionRef.current;
    if (!session) {
      return;
    }
    const messages = await session.loop.getMessages();
    if (!alive.current) {
      return;
    }
    if (command.name === "memory") {
      setScreen({ kind: "memory", messages, items: session.memory.current });
      return;
    }
    setScreen({ kind: "compact", messages, phase: "running" });
    try {
      const result = await withTrace("cli", cliSessionId(), () => session.context.compact());
      if (!alive.current) {
        return;
      }
      setScreen({ kind: "compact", messages, phase: "done", ...result });
    } catch (error) {
      if (alive.current) {
        setScreen({ kind: "error", message: errorText(error) });
      }
    }
  }

  function stopProcessing(): void {
    stopRef.current?.abort();
  }

  async function leaveReview(exit: ReviewExit): Promise<void> {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    try {
      const messages = await withTrace("cli", cliSessionId(), () => settleReview(session, exit));
      if (!alive.current) {
        return;
      }
      setScreen({
        kind: "user",
        messages,
        notice: "已退出审核，下次继续时会重新翻译。",
      });
    } catch (error) {
      if (alive.current) {
        setScreen({ kind: "error", message: errorText(error) });
      }
    }
  }

  async function show(session: AppSession, pause: Pause): Promise<void> {
    if (!alive.current) {
      return;
    }
    if (pause.kind === "copilot") {
      setScreen({ kind: "copilot", requests: pause.requests });
      return;
    }
    const messages = await session.loop.getMessages();
    if (!alive.current) {
      return;
    }
    setScreen({ kind: "user", messages });
  }

  async function watch(
    seed: readonly ModelMessage[],
    run: (onStep: (step: AgentLoopNext) => void, signal: AbortSignal) => Promise<Pause>,
  ): Promise<Pause> {
    const messages = [...seed];
    const controller = new AbortController();
    stopRef.current = controller;
    setScreen({ kind: "running", messages, processing: true });
    try {
      return await run(
        (step) => {
          if (controller.signal.aborted) {
            return;
          }
          messages.push(...step.messages);
          if (!alive.current) {
            return;
          }
          const processing = step.copilotRequests.length === 0 && step.nextActor !== "user";
          setScreen({ kind: "running", messages: [...messages], processing });
        },
        controller.signal,
      );
    } finally {
      if (stopRef.current === controller) {
        stopRef.current = undefined;
      }
    }
  }

  async function continueWith<TArgument>(
    submit: (
      session: AppSession,
      argument: TArgument,
      onStep?: (step: AgentLoopNext) => void,
      signal?: AbortSignal,
    ) => Promise<Pause>,
    argument: TArgument,
  ): Promise<void> {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    try {
      const prior = await session.loop.getMessages();
      const seed =
        submit === submitUserText && typeof argument === "string"
          ? [...prior, { role: "user" as const, content: argument }]
          : prior;
      const pause = await watch(seed, (onStep, signal) =>
        withTrace("cli", cliSessionId(), () => submit(session, argument, onStep, signal)),
      );
      await show(session, pause);
    } catch (error) {
      if (alive.current) {
        setScreen({ kind: "error", message: errorText(error) });
      }
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  void startup(() => {
    render(<App />);
  });
}

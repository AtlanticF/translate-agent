import { pathToFileURL } from "node:url";
import type { ModelMessage, UserModelMessage } from "ai";
import { render, Text } from "ink";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { AgentLoopNext } from "../agent/agent-loop.js";
import type { CopilotResponseEntry } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { activityItems, waitingLabel, type ActivityItem } from "./activity.js";
import { ActivityScreen } from "./activity-screen.js";
import { CopilotScreen } from "./copilot-screen.js";
import { rememberReview, type Paragraph } from "./paragraphs.js";
import { runUntilPause, type Pause } from "./pause.js";
import { createSession } from "./session.js";
import { UserScreen } from "./user-screen.js";

export type AppSession = {
  loop: {
    next: () => Promise<AgentLoopNext>;
    userInput: (messages: UserModelMessage[]) => Promise<void>;
    getMessages: () => Promise<ModelMessage[]>;
  };
  context: {
    addCopilotResponses: (responses: readonly CopilotResponseEntry[]) => void;
  };
};

type Screen =
  | { kind: "running"; items: ActivityItem[]; waiting: string }
  | { kind: "error"; message: string }
  | { kind: "user"; messages: ModelMessage[] }
  | { kind: "copilot"; requests: CopilotRequest[] };

type AppProps = {
  start?: () => Promise<AppSession>;
};

export async function submitUserText(
  session: AppSession,
  text: string,
  onStep?: (step: AgentLoopNext) => void,
): Promise<Pause> {
  await session.loop.userInput([{ role: "user", content: text }]);
  return runUntilPause(session.loop, onStep);
}

export async function submitCopilotReview(
  session: AppSession,
  responses: readonly CopilotResponseEntry[],
  onStep?: (step: AgentLoopNext) => void,
): Promise<Pause> {
  session.context.addCopilotResponses(responses);
  return runUntilPause(session.loop, onStep);
}

export function App({ start = createSession }: AppProps): ReactElement {
  const [screen, setScreen] = useState<Screen>({
    kind: "running",
    items: [],
    waiting: "正在准备",
  });
  const alive = useRef(true);
  const sessionRef = useRef<AppSession | undefined>(undefined);
  const [done, setDone] = useState<Paragraph[]>([]);

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
        const pause = await watch("正在准备", (onStep) => runUntilPause(session.loop, onStep));
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
    return <ActivityScreen items={screen.items} waiting={screen.waiting} />;
  }
  if (screen.kind === "error") {
    return <Text>出错: {screen.message}</Text>;
  }
  if (screen.kind === "user") {
    return (
      <UserScreen
        messages={screen.messages}
        onSubmit={(text) => {
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
    />
  );

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
    waiting: string,
    run: (onStep: (step: AgentLoopNext) => void) => Promise<Pause>,
  ): Promise<Pause> {
    const items: ActivityItem[] = [];
    setScreen({ kind: "running", items, waiting });
    return run((step) => {
      items.push(...activityItems(step));
      if (!alive.current) {
        return;
      }
      const stillRunning = step.copilotRequests.length === 0 && step.nextActor !== "user";
      setScreen({
        kind: "running",
        items: [...items],
        waiting: stillRunning ? waitingLabel(step) : waiting,
      });
    });
  }

  async function continueWith<TArgument>(
    submit: (
      session: AppSession,
      argument: TArgument,
      onStep?: (step: AgentLoopNext) => void,
    ) => Promise<Pause>,
    argument: TArgument,
  ): Promise<void> {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    try {
      const waiting = submit === submitUserText ? "正在思考" : "正在处理审核";
      const pause = await watch(waiting, (onStep) => submit(session, argument, onStep));
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
  render(<App />);
}

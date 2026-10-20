import { ProgressBar } from "@inkjs/ui";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useRef, useState, type ReactElement } from "react";
import type { CopilotResponseEntry } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { editInFile } from "./editor.js";
import type { Paragraph } from "./paragraphs.js";
import { ReviewColumns } from "./review-panes.js";

type CopilotScreenProps = {
  done?: readonly Paragraph[];
  requests: readonly CopilotRequest[];
  onSubmit: (responses: CopilotResponseEntry[]) => void;
  edit?: (initial: string) => Promise<string>;
};

export type CopilotKey = "approve" | "reject" | "refine";

export function copilotKey(input: string): CopilotKey | undefined {
  if (input === "a") {
    return "approve";
  }
  if (input === "r") {
    return "reject";
  }
  if (input === "f") {
    return "refine";
  }
  return undefined;
}

export const rejectReasonHint = "# Please provide a reason for rejection:";

// 提示行只告诉用户这里要写原因，不把它当成原因本身。
export function submittedReason(text: string): string | undefined {
  const reason = text
    .split("\n")
    .filter((line) => line.trim() !== rejectReasonHint)
    .join("\n")
    .trim();
  return reason === "" ? undefined : reason;
}

// 译文保留编辑器保存的内容。只有整段空白才当成取消。
export function submittedRefinement(text: string): string | undefined {
  if (text.trim() === "") {
    return undefined;
  }
  return text;
}

export function reviewProgress(
  doneCount: number,
  requestCount: number,
  index: number,
): { percent: number; remaining: number } {
  const total = doneCount + requestCount;
  const finished = Math.min(doneCount + index, total);
  return {
    percent: total === 0 ? 0 : Math.round((finished / total) * 100),
    remaining: total - finished,
  };
}

export function CopilotScreen({
  done = [],
  requests,
  onSubmit,
  edit,
}: CopilotScreenProps): ReactElement {
  const { columns } = useWindowSize();
  const { suspendTerminal } = useApp();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const responses = useRef<CopilotResponseEntry[]>([]);
  const busy = useRef(false);
  const finished = useRef(false);
  const request = requests[index];
  const openEditor =
    edit ??
    (async (initial: string) => {
      let next = initial;
      await suspendTerminal(async () => {
        next = await editInFile(initial);
      });
      return next;
    });

  useInput((input) => {
    const current = requests[responses.current.length];
    if (!current || busy.current || finished.current) {
      return;
    }
    const action = copilotKey(input);
    if (!action) {
      return;
    }
    const callId = current.tool.callId;
    if (action === "approve") {
      pushResponse({ status: "approve", tool: { callId } });
      return;
    }

    busy.current = true;
    setError(undefined);
    const initial =
      action === "refine" ? current.translate_string : `${rejectReasonHint}\n`;
    void openEditor(initial)
      .then((text) => {
        if (action === "reject") {
          const reason = submittedReason(text);
          if (reason === undefined) {
            return;
          }
          pushResponse({ status: "reject", reason, tool: { callId } });
          return;
        }
        const refined = submittedRefinement(text);
        if (refined === undefined) {
          return;
        }
        pushResponse({
          status: "refined",
          refined_translated_string: refined,
          tool: { callId },
        });
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        busy.current = false;
      });
  });

  if (!request) {
    return <Text>没有待审核的译文</Text>;
  }

  const progress = reviewProgress(done.length, requests.length, index);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <ReviewColumns
        source={request.src_string}
        translation={request.translate_string}
        direction={columns < 80 ? "column" : "row"}
      />
      <Box marginTop={1}>
        <Box flexDirection="column" flexGrow={1}>
          <Text>
            <Text color="cyan">a</Text> 通过
          </Text>
          <Text>
            <Text color="cyan">r</Text> 拒绝
          </Text>
          <Text>
            <Text color="cyan">f</Text> 修改
          </Text>
        </Box>
        <Box flexDirection="column" alignItems="flex-end" width={16}>
          <Text>{progress.percent}%</Text>
          <ProgressBar value={progress.percent} />
          <Text dimColor>剩余 {progress.remaining}</Text>
        </Box>
      </Box>
      {error ? <Text color="red">无法打开编辑器: {error}</Text> : null}
    </Box>
  );

  function pushResponse(response: CopilotResponseEntry): void {
    responses.current.push(response);
    if (responses.current.length === requests.length) {
      finished.current = true;
      onSubmit([...responses.current]);
      return;
    }
    setIndex(responses.current.length);
  }
}

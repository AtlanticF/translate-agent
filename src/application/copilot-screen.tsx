import { Box, Text, useApp, useInput } from "ink";
import { useRef, useState, type ReactElement } from "react";
import type { CopilotResponseEntry } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { editInFile } from "./editor.js";

type CopilotScreenProps = {
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

export function submittedReason(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

// 译文保留编辑器保存的内容。只有整段空白才当成取消。
export function submittedRefinement(text: string): string | undefined {
  if (text.trim() === "") {
    return undefined;
  }
  return text;
}

export function CopilotScreen({
  requests,
  onSubmit,
  edit,
}: CopilotScreenProps): ReactElement {
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
    const initial = action === "refine" ? current.translate_string : "";
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

  return (
    <Box flexDirection="column">
      <Text>
        审核 {index + 1}/{requests.length}
      </Text>
      <Text>文件: {request.file_path}</Text>
      <Text>原文: {request.src_string}</Text>
      <Text>草稿: {request.translate_string}</Text>
      <Text>a 通过    r 拒绝    f 修改</Text>
      {error ? <Text>无法打开编辑器: {error}</Text> : null}
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

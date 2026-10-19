import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useRef, useState, type ReactElement } from "react";
import type { CopilotResponseEntry } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";
import { editInFile } from "./editor.js";
import { visibleParagraphs, type Paragraph } from "./paragraphs.js";
import { SourcePane, TranslationPane } from "./review-panes.js";

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
  done = [],
  requests,
  onSubmit,
  edit,
}: CopilotScreenProps): ReactElement {
  const { columns } = useWindowSize();
  const { suspendTerminal } = useApp();
  const [index, setIndex] = useState(0);
  const [decided, setDecided] = useState<Paragraph[]>([]);
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
      pushResponse(current, { status: "approve", tool: { callId } });
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
          pushResponse(current, { status: "reject", reason, tool: { callId } });
          return;
        }
        const refined = submittedRefinement(text);
        if (refined === undefined) {
          return;
        }
        pushResponse(current, {
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

  const paragraphs = visibleParagraphs([...done, ...decided], requests.slice(index));
  const position = paragraphs.findIndex((item) => item.status === "current") + 1;

  return (
    <Box flexDirection="column">
      <Text>
        <Text dimColor>{request.file_path} </Text>
        {position}/{paragraphs.length}
      </Text>
      <Box flexDirection={columns < 80 ? "column" : "row"} gap={1}>
        <SourcePane paragraphs={paragraphs} />
        <TranslationPane paragraphs={paragraphs} />
      </Box>
      <Text>
        <Text color="cyan">a</Text> 通过    <Text color="cyan">r</Text> 拒绝    <Text color="cyan">f</Text> 修改
      </Text>
      {error ? <Text color="red">无法打开编辑器: {error}</Text> : null}
    </Box>
  );

  function pushResponse(currentRequest: CopilotRequest, response: CopilotResponseEntry): void {
    const paragraph = finishedParagraph(currentRequest, response);
    if (paragraph) {
      setDecided((items) => [...items, paragraph]);
    }
    responses.current.push(response);
    if (responses.current.length === requests.length) {
      finished.current = true;
      onSubmit([...responses.current]);
      return;
    }
    setIndex(responses.current.length);
  }
}

function finishedParagraph(
  request: CopilotRequest,
  response: CopilotResponseEntry,
): Paragraph | undefined {
  if (response.status === "reject") {
    return undefined;
  }
  return {
    id: request.tool.callId,
    src: request.src_string,
    translation:
      response.status === "refined" ? response.refined_translated_string : request.translate_string,
    status: "done",
  };
}

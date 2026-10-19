import type { CopilotResponseEntry } from "../messages/context.js";
import type { CopilotRequest } from "../prompts/system.memory.js";

export type Paragraph = {
  id: string;
  src: string;
  translation: string;
  status: "done" | "current" | "pending";
};

export function visibleParagraphs(
  done: readonly Paragraph[],
  remaining: readonly CopilotRequest[],
): Paragraph[] {
  return [
    ...done.map((item) => ({ ...item, status: "done" as const })),
    ...remaining.map((request, position) => ({
      id: request.tool.callId,
      src: request.src_string,
      translation: position === 0 ? request.translate_string : "…",
      status: position === 0 ? ("current" as const) : ("pending" as const),
    })),
  ];
}

export function rememberReview(
  done: readonly Paragraph[],
  requests: readonly CopilotRequest[],
  responses: readonly CopilotResponseEntry[],
): Paragraph[] {
  const added = responses.flatMap((response) => {
    const request = requests.find((item) => item.tool.callId === response.tool.callId);
    if (!request || response.status === "reject") {
      return [];
    }
    return [
      {
        id: request.tool.callId,
        src: request.src_string,
        translation:
          response.status === "refined"
            ? response.refined_translated_string
            : request.translate_string,
        status: "done" as const,
      },
    ];
  });
  return [...done, ...added];
}

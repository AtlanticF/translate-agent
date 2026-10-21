"use client";

import { useState } from "react";
import type { CopilotRequest } from "../../src/prompts/system.memory";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";

type ReviewResponse =
  | { status: "approve"; tool: { callId: string } }
  | { status: "reject"; reason: string; tool: { callId: string } }
  | { status: "refined"; refined_translated_string: string; tool: { callId: string } };

export function CopilotReview({
  request,
  busy,
  onSubmit,
}: {
  request: CopilotRequest;
  busy: boolean;
  onSubmit: (response: ReviewResponse) => void;
}) {
  const [mode, setMode] = useState<"choose" | "reject" | "refine">("choose");
  const [draft, setDraft] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-3">
      <div className="rounded-lg border px-3 py-3 text-sm">
        <p className="text-muted-foreground">{request.file_path}</p>
        <p className="mt-2 whitespace-pre-wrap">{request.src_string}</p>
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{request.translate_string}</p>
      </div>
      {mode === "choose" ? (
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSubmit({ status: "approve", tool: { callId: request.tool.callId } })}
          >
            通过
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => open("reject")}>
            拒绝
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => open("refine")}>
            修改
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = draft.trim();
            if (!text) {
              return;
            }
            if (mode === "reject") {
              onSubmit({ status: "reject", reason: text, tool: { callId: request.tool.callId } });
              return;
            }
            onSubmit({
              status: "refined",
              refined_translated_string: draft,
              tool: { callId: request.tool.callId },
            });
          }}
        >
          <InputGroup>
            <InputGroupTextarea
              value={draft}
              rows={3}
              placeholder={mode === "reject" ? "Why reject this translation?" : "Edit the translation"}
              onChange={(event) => setDraft(event.target.value)}
            />
          </InputGroup>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              完成
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode("choose")}>
              返回
            </Button>
          </div>
        </form>
      )}
    </div>
  );

  function open(next: "reject" | "refine") {
    setDraft(next === "refine" ? request.translate_string : "");
    setMode(next);
  }
}

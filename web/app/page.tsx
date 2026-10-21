"use client";

import { useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { TerminalIcon } from "lucide-react";
import { CopilotReview } from "@/components/copilot-review";
import { Welcome } from "@/components/welcome";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { inputPlaceholder, submittedUserText } from "../../shared/welcome";
import type { CopilotRequest } from "../../src/prompts/system.memory";
import { toolTitle, viewItems } from "../lib/view-items";

type TurnBody = {
  sessionId: string;
  agentResponse: {
    messages: ModelMessage[];
    copilotRequests: CopilotRequest[];
  };
};

export default function Home() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [requests, setRequests] = useState<CopilotRequest[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pending = useRef(false);
  const items = viewItems(messages);
  const review = requests[0];

  async function send() {
    const text = submittedUserText(draft);
    if (!text || pending.current || review) {
      return;
    }
    pending.current = true;
    setDraft("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    try {
      await turn({ sessionId, userInput: text });
    } finally {
      pending.current = false;
    }
  }

  async function reviewDone(response: {
    status: "approve" | "reject" | "refined";
    reason?: string;
    refined_translated_string?: string;
    tool: { callId: string };
  }) {
    if (pending.current) {
      return;
    }
    pending.current = true;
    try {
      await turn({ sessionId, copilotResponses: [response] });
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1">
        {items.length === 0 && !busy ? (
          <Welcome />
        ) : (
          <MessageScrollerProvider>
            <MessageScroller className="h-full">
              <MessageScrollerViewport>
                <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
                  {items.map((item) =>
                    item.kind === "tool" ? (
                      <MessageScrollerItem key={item.id} messageId={item.id}>
                        <ToolTrace item={item} />
                      </MessageScrollerItem>
                    ) : (
                      <MessageScrollerItem key={item.id} messageId={item.id}>
                        <Message align={item.kind === "user" ? "end" : "start"}>
                          <MessageContent>
                            <Bubble
                              align={item.kind === "user" ? "end" : "start"}
                              variant={item.kind === "user" ? "muted" : "default"}
                            >
                              <BubbleContent>{item.text}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    ),
                  )}
                  {busy ? (
                    <MessageScrollerItem messageId="processing">
                      <Trace>
                        <TraceLine>
                          <TraceTitle>Processing ...</TraceTitle>
                        </TraceLine>
                      </Trace>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>
      {error ? <p className="mx-auto w-full max-w-3xl px-4 text-sm text-destructive">{error}</p> : null}
      {review ? <CopilotReview request={review} busy={busy} onSubmit={(response) => void reviewDone(response)} /> : null}
      <form
        className="mx-auto w-full max-w-3xl px-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            value={draft}
            placeholder={inputPlaceholder}
            rows={1}
            disabled={busy || Boolean(review)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupButton type="submit" size="sm" disabled={busy || Boolean(review)}>
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );

  async function turn(body: {
    sessionId?: string;
    userInput?: string;
    copilotResponses?: Array<{
      status: "approve" | "reject" | "refined";
      reason?: string;
      refined_translated_string?: string;
      tool: { callId: string };
    }>;
  }) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as TurnBody | { error: string };
      if (!response.ok || !("agentResponse" in payload)) {
        throw new Error("error" in payload ? payload.error : "request failed");
      }
      setSessionId(payload.sessionId);
      setMessages((current) => [...current, ...payload.agentResponse.messages]);
      setRequests(payload.agentResponse.copilotRequests);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }
}

function ToolTrace({ item }: { item: Extract<ReturnType<typeof viewItems>[number], { kind: "tool" }> }) {
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <TerminalIcon />
            </TraceIcon>
            <TraceTitle>{toolTitle(item)}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <CodeBlock size="sm" variant={item.state === "error" ? "destructive" : "default"}>
            <CodeBlockContent wrap>{item.detail}</CodeBlockContent>
          </CodeBlock>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelMessage } from "ai";
import { TerminalIcon } from "lucide-react";
import { CopilotReview } from "@/components/copilot-review";
import { SessionSidebar } from "@/components/session-sidebar";
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
import type { CopilotReviewResponse } from "../lib/copilot-batch";
import { noteCopilotDecision } from "../lib/copilot-batch";
import type { ClientTurn, ClientTurnBody } from "../lib/client-loop";
import { runTurns } from "../lib/client-loop";
import { toolTitle, viewItems } from "../lib/view-items";
import type { SessionSummary } from "../lib/session-title";

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [requests, setRequests] = useState<ClientTurn["agentResponse"]["copilotRequests"]>([]);
  const [decisions, setDecisions] = useState<Record<string, CopilotReviewResponse>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pending = useRef(false);
  const requestsRef = useRef(requests);
  const decisionsRef = useRef(decisions);
  const items = viewItems(messages);
  const reviewing = requests.length > 0;
  const decidedCount = requests.filter((request) => decisions[request.tool.callId]).length;

  useEffect(() => {
    void loadSessions();
  }, []);

  function newSession() {
    if (pending.current) {
      return;
    }
    setSessionId(undefined);
    setMessages([]);
    requestsRef.current = [];
    decisionsRef.current = {};
    setRequests([]);
    setDecisions({});
    setDraft("");
    setError(undefined);
  }

  async function openSession(id: string) {
    if (pending.current || id === sessionId) {
      return;
    }
    pending.current = true;
    setError(undefined);
    try {
      const response = await fetch(`/sessions/${id}`);
      const payload = (await response.json()) as { id: string; messages: ModelMessage[] } | { error: string };
      if (!response.ok || !("messages" in payload)) {
        throw new Error("error" in payload ? payload.error : "request failed");
      }
      setSessionId(payload.id);
      setMessages(payload.messages);
      requestsRef.current = [];
      decisionsRef.current = {};
      setRequests([]);
      setDecisions({});
      setDraft("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      pending.current = false;
    }
  }

  async function send() {
    const text = submittedUserText(draft);
    if (!text || pending.current || requestsRef.current.length > 0) {
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

  function decide(response: CopilotReviewResponse) {
    if (pending.current) {
      return;
    }
    const noted = noteCopilotDecision(requestsRef.current, decisionsRef.current, response);
    if (noted.decisions === decisionsRef.current) {
      return;
    }
    decisionsRef.current = noted.decisions;
    setDecisions(noted.decisions);
    if (noted.ready) {
      void reviewDone(noted.ready);
    }
  }

  async function reviewDone(responses: CopilotReviewResponse[]) {
    if (pending.current) {
      return;
    }
    pending.current = true;
    try {
      await turn({ sessionId, copilotResponses: responses });
    } finally {
      pending.current = false;
    }
  }

  return (
    <div className="flex h-dvh">
      <SessionSidebar
        sessions={sessions}
        currentId={sessionId}
        disabled={busy}
        onNew={newSession}
        onSelect={(id) => void openSession(id)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
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
      {reviewing ? (
        <div className="max-h-[50dvh] overflow-y-auto">
          {requests.length > 1 ? (
            <p className="mx-auto w-full max-w-3xl px-4 text-sm text-muted-foreground">
              {decidedCount}/{requests.length} 已审核
            </p>
          ) : null}
          {requests.map((request) => (
            <CopilotReview
              key={request.tool.callId}
              request={request}
              busy={busy}
              decision={decisions[request.tool.callId]}
              onSubmit={decide}
            />
          ))}
        </div>
      ) : null}
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
            disabled={busy || reviewing}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupButton type="submit" size="sm" disabled={busy || reviewing}>
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      </div>
    </div>
  );

  async function turn(body: ClientTurnBody) {
    setBusy(true);
    setError(undefined);
    try {
      await runTurns(postTurn, body, (step) => {
        setSessionId(step.sessionId);
        if (step.agentResponse.messages.length > 0) {
          setMessages((current) => [...current, ...step.agentResponse.messages]);
        }
        const nextRequests = step.agentResponse.copilotRequests;
        requestsRef.current = nextRequests;
        decisionsRef.current = {};
        setRequests(nextRequests);
        setDecisions({});
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      void loadSessions();
    }
  }

  async function loadSessions() {
    try {
      const response = await fetch("/sessions");
      const payload = (await response.json()) as { sessions: SessionSummary[] } | { error: string };
      if (!response.ok || !("sessions" in payload)) {
        throw new Error("error" in payload ? payload.error : "request failed");
      }
      setSessions(payload.sessions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
}

async function postTurn(body: ClientTurnBody): Promise<ClientTurn> {
  const response = await fetch("/next", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ClientTurn | { error: string };
  if (!response.ok || !("agentResponse" in payload)) {
    throw new Error("error" in payload ? payload.error : "request failed");
  }
  return payload;
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

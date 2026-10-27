"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ModelMessage } from "ai";
import { Loader2Icon, PaperclipIcon, TerminalIcon, Trash2Icon } from "lucide-react";
import { CopilotReview } from "@/components/copilot-review";
import { SessionSidebar } from "@/components/session-sidebar";
import { Welcome } from "@/components/welcome";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import { Progress } from "@/components/ui/progress";
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
import type { ClientFile, ClientTurn, ClientTurnBody } from "../lib/client-loop";
import { runTurns } from "../lib/client-loop";
import { toolTitle, viewItems } from "../lib/view-items";
import type { SessionSummary } from "../lib/session-title";

type ImportedFile = ClientFile;

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary>();
  const [deleting, setDeleting] = useState(false);
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [requests, setRequests] = useState<ClientTurn["agentResponse"]["copilotRequests"]>([]);
  const [decisions, setDecisions] = useState<Record<string, CopilotReviewResponse>>({});
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [reveal, setReveal] = useState<"restore" | "live">("live");
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestsRef = useRef(requests);
  const decisionsRef = useRef(decisions);
  const items = viewItems(messages);
  const reviewing = requests.length > 0;
  const decidedCount = requests.filter((request) => decisions[request.tool.callId]).length;

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    if (reveal !== "restore") {
      return;
    }
    const timer = window.setTimeout(() => setReveal("live"), 800);
    return () => window.clearTimeout(timer);
  }, [reveal]);

  function newSession() {
    if (pending.current) {
      return;
    }
    setReveal("live");
    setSessionId(undefined);
    setMessages([]);
    requestsRef.current = [];
    decisionsRef.current = {};
    setRequests([]);
    setDecisions({});
    setDraft("");
    setFiles([]);
    setError(undefined);
  }

  async function deleteSession() {
    const target = deleteTarget;
    if (!target || deleting) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    try {
      const response = await fetch(`/sessions/${target.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          | { error?: string }
          | undefined;
        throw new Error(payload?.error ?? "request failed");
      }
      setSessions((current) => current.filter((session) => session.id !== target.id));
      if (target.id === sessionId) {
        newSession();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setDeleteTarget(undefined);
      setDeleting(false);
    }
  }

  async function openSession(id: string) {
    if (pending.current || id === sessionId) {
      return;
    }
    pending.current = true;
    setError(undefined);
    try {
      const response = await fetch(`/sessions/${id}`);
      const payload = (await response.json()) as
        | { id: string; messages: ModelMessage[]; files?: ImportedFile[] }
        | { error: string };
      if (!response.ok || !("messages" in payload)) {
        throw new Error("error" in payload ? payload.error : "request failed");
      }
      setReveal("restore");
      setSessionId(payload.id);
      setMessages(payload.messages);
      setFiles(payload.files ?? []);
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
        onDelete={setDeleteTarget}
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
                  {items.map((item, index) =>
                    item.kind === "tool" ? (
                      <MessageScrollerItem
                        key={item.id}
                        messageId={item.id}
                        className={enterClass("tool")}
                        style={enterStyle(index, reveal)}
                      >
                        <ToolTrace item={item} />
                      </MessageScrollerItem>
                    ) : (
                      <MessageScrollerItem
                        key={item.id}
                        messageId={item.id}
                        className={enterClass(item.kind)}
                        style={enterStyle(index, reveal)}
                      >
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
                    <MessageScrollerItem
                      messageId="processing"
                      className={enterClass("assistant")}
                      style={enterStyle(items.length, reveal)}
                    >
                      <Trace>
                        <TraceLine status="running">
                          <TraceIcon>
                            <Loader2Icon className="animate-spin" />
                          </TraceIcon>
                          <TraceTitle>Processing</TraceTitle>
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
        className={`mx-auto w-full max-w-3xl px-4 pb-4 ${dragging ? "opacity-70" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
      >
        {files.length > 0 ? (
          <ul className="mb-2 flex flex-col gap-2">
            {files.map((file) => (
              <FileProgress key={file.id} file={file} sessionId={sessionId} busy={busy} />
            ))}
          </ul>
        ) : null}
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
          <InputGroupAddon align="block-end" className="justify-between">
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = "";
              }}
            />
            <InputGroupButton type="button" size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
              <PaperclipIcon />
              上传
            </InputGroupButton>
            <InputGroupButton type="submit" size="sm" disabled={busy || reviewing}>
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      </div>
      <AlertDialog
        open={deleteTarget !== undefined}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>删除会话？</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}”及其上传的文件将被永久删除，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteSession()}
            >
              {deleting ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  async function upload(list: FileList | null) {
    const selected = list ? [...list] : [];
    if (selected.length === 0) {
      return;
    }
    const id = sessionId ?? crypto.randomUUID();
    const body = new FormData();
    for (const file of selected) {
      body.append("file", file);
    }
    setError(undefined);
    try {
      const response = await fetch(`/sessions/${id}/files`, { method: "POST", body });
      const payload = (await response.json()) as
        | { sessionId: string; files: ImportedFile[] }
        | { error: string };
      if (!response.ok || !("files" in payload)) {
        throw new Error("error" in payload ? payload.error : "upload failed");
      }
      setSessionId(payload.sessionId);
      setFiles(payload.files);
      void loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function turn(body: ClientTurnBody) {
    setBusy(true);
    setError(undefined);
    try {
      await runTurns(postTurn, body, (step) => {
        setSessionId(step.sessionId);
        if (step.files) {
          setFiles(step.files);
        }
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

function FileProgress({
  file,
  sessionId,
  busy,
}: {
  file: ImportedFile;
  sessionId: string | undefined;
  busy: boolean;
}) {
  const waiting = busy && file.status !== "done" && file.progress <= 0;
  const value = file.status === "done" ? 100 : waiting ? null : Math.round(file.progress * 100);
  const label = file.status === "done" ? "已完成" : waiting ? "翻译中" : `${Math.round(file.progress * 100)}%`;
  return (
    <li className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center gap-3">
        <span className="min-w-0 truncate">{file.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{label}</span>
        <a className="shrink-0 text-cyan-700" href={downloadHref(sessionId, file.id)}>
          下载译文
        </a>
      </div>
      <Progress
        value={value}
        aria-label={`${file.name} 翻译进度`}
        className="gap-0 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-foreground/15"
      />
    </li>
  );
}

function enterClass(kind: "user" | "assistant" | "tool"): string {
  const motion = "animate-in fade-in duration-300 fill-mode-both motion-reduce:animate-none";
  if (kind === "user") {
    return `${motion} slide-in-from-bottom-4 zoom-in-95`;
  }
  return `${motion} slide-in-from-bottom-2`;
}

function enterStyle(index: number, reveal: "restore" | "live"): CSSProperties | undefined {
  if (reveal !== "restore") {
    return undefined;
  }
  const delay = `${Math.min(index, 12) * 40}ms`;
  return { animationDelay: delay, "--tw-animation-delay": delay } as CSSProperties;
}

function downloadHref(sessionId: string | undefined, fileId: string): string {
  if (!sessionId) {
    return "#";
  }
  return `/sessions/${sessionId}/files/${fileId}/translated`;
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

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ModelMessage } from "ai";
import { ArrowDownToLineIcon, ArrowUpIcon, CheckIcon, FileTextIcon, LanguagesIcon, Loader2Icon, PaperclipIcon, TerminalIcon, Trash2Icon, UploadCloudIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
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
  MessageScrollerButton,
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
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { submittedUserText } from "../../shared/welcome";
import type { CopilotReviewResponse } from "../lib/copilot-batch";
import { noteCopilotDecision } from "../lib/copilot-batch";
import { pendingCopilotRequests } from "../lib/pending-copilot";
import { readStoredSessionId, writeStoredSessionId } from "../lib/stored-session";
import type {
  ClientFile,
  ClientLiveEvent,
  ClientTurn,
  ClientTurnBody,
} from "../lib/client-loop";
import { postNextTurn, runTurns } from "../lib/client-loop";
import { toolTitle, viewItems } from "../lib/view-items";
import type { SessionSummary } from "../lib/session-title";

type ImportedFile = ClientFile;
type LiveActivity = Extract<ClientLiveEvent, { type: "activity" }>;

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
  const [liveText, setLiveText] = useState("");
  const [liveReasoning, setLiveReasoning] = useState("");
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [reveal, setReveal] = useState<"restore" | "live">("live");
  const [restoring, setRestoring] = useState(true);
  const [uploading, setUploading] = useState(false);
  const pending = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  const requestsRef = useRef(requests);
  const decisionsRef = useRef(decisions);
  const activitiesById = new Map(liveActivities.map((activity) => [activity.id, activity]));
  const items = viewItems(messages).map((item) => {
    const activity = item.kind === "tool" ? activitiesById.get(item.id) : undefined;
    if (!activity || item.kind !== "tool") {
      return item;
    }
    return {
      ...item,
      state: activity.state === "preparing" ? "running" : activity.state,
    };
  });
  const transientActivities = liveActivities.filter(
    (activity) => !items.some((item) => item.kind === "tool" && item.id === activity.id),
  );
  const thinking = busy && !liveText && liveReasoning.length > 0;
  const waitingForActivity =
    busy &&
    !liveText &&
    !thinking &&
    liveActivities.length === 0 &&
    !items.some((item) => item.kind === "tool" && item.state === "running");
  const reviewing = requests.length > 0;
  const decidedCount = requests.filter((request) => decisions[request.tool.callId]).length;
  const showWelcome = items.length === 0 && !busy && !restoring;
  const composerDisabled = busy || reviewing || restoring || uploading;
  const currentTitle = sessions.find((session) => session.id === sessionId)?.title;

  useEffect(() => {
    const id = readStoredSessionId(window.location, window.localStorage);
    void loadSessions();
    if (!id) {
      setRestoring(false);
      return;
    }
    void openSession(id).finally(() => setRestoring(false));
  }, []);

  useEffect(() => {
    if (restoring || !sessionId) {
      return;
    }
    rememberSession(sessionId);
  }, [sessionId, restoring]);

  useEffect(() => {
    if (reveal !== "restore") {
      return;
    }
    const timer = window.setTimeout(() => setReveal("live"), 800);
    return () => window.clearTimeout(timer);
  }, [reveal]);

  // 处理中的耗时计时，让用户在等待 SSE 事件之间也能感知进展。
  useEffect(() => {
    if (!busy) {
      return;
    }
    const startedAt = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

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
    setLiveText("");
    setLiveReasoning("");
    setLiveActivities([]);
    setError(undefined);
    rememberSession(undefined);
  }

  async function renameSession(id: string, title: string) {
    setError(undefined);
    try {
      const response = await fetch(`/sessions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = (await response.json().catch(() => undefined)) as
        | SessionSummary
        | { error?: string }
        | undefined;
      if (!response.ok || !payload || !("title" in payload)) {
        const message = payload && "error" in payload ? payload.error : undefined;
        throw new Error(message || "request failed");
      }
      setSessions((current) =>
        current
          .map((session) => (session.id === payload.id ? { ...session, ...payload } : session))
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
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
        if (response.status === 404 && !sessionId) {
          rememberSession(undefined);
        }
        throw new Error("error" in payload ? payload.error : "request failed");
      }
      setReveal("restore");
      setSessionId(payload.id);
      setMessages(payload.messages);
      setFiles(payload.files ?? []);
      const nextRequests = pendingCopilotRequests(payload.messages);
      requestsRef.current = nextRequests;
      decisionsRef.current = {};
      setRequests(nextRequests);
      setDecisions({});
      setDraft("");
      setLiveText("");
      setLiveReasoning("");
      setLiveActivities([]);
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
    <div className="agent-app flex h-dvh overflow-hidden">
      <SessionSidebar
        sessions={sessions}
        currentId={sessionId}
        disabled={busy || uploading || restoring}
        loading={restoring}
        onNew={newSession}
        onSelect={(id) => void openSession(id)}
        onRename={(id, title) => void renameSession(id, title)}
        onDelete={setDeleteTarget}
      />
      <main className="workspace relative flex min-w-0 flex-1 flex-col">
      <header className="workspace-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hidden text-muted-foreground md:block"><LanguagesIcon className="size-4" /></span>
          <span className="truncate text-sm font-medium" title={currentTitle}>{currentTitle ?? "翻译工作台"}</span>
        </div>
        <span className="workspace-status" role="status">
          {busy || restoring || uploading ? <Loader2Icon className="size-3 animate-spin" /> : <span className="status-dot" />}
          <span>{restoring ? "恢复会话中" : uploading ? "正在上传" : busy ? "正在处理" : reviewing ? "等待你审核" : "逐段翻译 · 由你定稿"}</span>
        </span>
      </header>
      <div className={cn("workspace-body flex min-h-0 flex-1 flex-col", showWelcome && "workspace-body-welcome")}>
      <div className={cn("min-h-0 flex-1", showWelcome && "welcome-container")}>
        {showWelcome ? (
          <Welcome
            disabled={composerDisabled}
            onPrompt={(prompt) => {
              setDraft(prompt);
              composerInput.current?.focus();
            }}
            onUpload={() => fileInput.current?.click()}
          />
        ) : restoring ? (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin" />正在恢复你的工作台…
          </div>
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
                              variant={item.kind === "user" ? "muted" : "ghost"}
                            >
                              <BubbleContent>{item.text}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    ),
                  )}
                  {liveText ? (
                    <MessageScrollerItem
                      messageId="live-text"
                      className={enterClass("assistant")}
                      style={enterStyle(items.length, reveal)}
                    >
                      <Message align="start">
                        <MessageContent>
                          <Bubble align="start" variant="ghost">
                            <BubbleContent>{liveText}</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ) : null}
                  {thinking ? (
                    <MessageScrollerItem
                      messageId="thinking"
                      className={enterClass("assistant")}
                      style={enterStyle(items.length + (liveText ? 1 : 0), reveal)}
                    >
                      <ThinkingTrace reasoning={liveReasoning} elapsed={elapsed} />
                    </MessageScrollerItem>
                  ) : null}
                  {transientActivities.map((activity, index) => (
                    <MessageScrollerItem
                      key={activity.id}
                      messageId={`live-activity-${activity.id}`}
                      className={enterClass("tool")}
                      style={enterStyle(
                        items.length + index + (liveText || thinking ? 1 : 0),
                        reveal,
                      )}
                    >
                      <ActivityTrace activity={activity} />
                    </MessageScrollerItem>
                  ))}
                  {waitingForActivity ? (
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
                          <TraceDescription>{formatElapsed(elapsed)}</TraceDescription>
                        </TraceLine>
                      </Trace>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton aria-label="回到最新消息" title="回到最新消息" />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>
      {error ? (
        <div className="mx-auto mb-3 flex w-full max-w-3xl items-start gap-3 px-4" role="alert">
          <p className="min-w-0 flex-1 rounded-xl bg-destructive/10 px-4 py-3 text-sm wrap-anywhere text-destructive">{error}</p>
          <Button type="button" variant="ghost" size="icon" aria-label="关闭错误提示" onClick={() => setError(undefined)}><XIcon /></Button>
        </div>
      ) : null}
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
        aria-label="翻译消息"
        className={cn("composer mx-auto w-full max-w-3xl shrink-0 px-4", dragging && "composer-dragging")}
        onSubmit={(event) => {
          event.preventDefault();
          if (!composerDisabled) void send();
        }}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          dragDepth.current += 1;
          if (!composerDisabled) setDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = composerDisabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!composerDisabled) void upload(event.dataTransfer.files);
        }}
      >
        {files.length > 0 ? (
          <ul className="composer-files mb-3 flex max-h-36 flex-col gap-2 overflow-y-auto" aria-label="会话文件">
            {files.map((file) => (
              <FileProgress key={file.id} file={file} sessionId={sessionId} busy={busy} />
            ))}
          </ul>
        ) : null}
        <div className="relative">
        <InputGroup className="composer-surface" aria-label="消息输入区">
          <InputGroupTextarea
            ref={composerInput}
            value={draft}
            aria-label="翻译要求"
            aria-describedby="composer-hint"
            placeholder={reviewing ? "完成上方审核后，继续对话…" : "输入文字、粘贴网页链接，或告诉我你的翻译要求…"}
            className="composer-textarea"
            rows={2}
            disabled={composerDisabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                event.preventDefault();
                if (!composerDisabled) void send();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="composer-toolbar justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                multiple
                aria-label="上传翻译文件"
                disabled={composerDisabled}
                className="hidden"
                onChange={(event) => {
                  void upload(event.target.files);
                  event.target.value = "";
                }}
              />
              <InputGroupButton type="button" size="sm" variant="ghost" className="composer-attach" disabled={composerDisabled} title="上传文件，也可拖拽到输入框" onClick={() => fileInput.current?.click()}>
                {uploading ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PaperclipIcon data-icon="inline-start" />}
                <span>{uploading ? "上传中…" : "添加文件"}</span>
              </InputGroupButton>
              <span className="composer-mode"><LanguagesIcon className="size-3.5" />翻译 Agent</span>
            </div>
            <InputGroupButton type="submit" size="icon-sm" variant="default" className="composer-send" aria-label={busy ? "正在处理" : "发送消息"} title="发送消息（Enter）" disabled={composerDisabled || !draft.trim()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {dragging ? (
          <div className="composer-drop-overlay" aria-hidden="true">
            <UploadCloudIcon className="size-7" /><span>松开即可上传文件</span><span className="text-xs font-normal text-muted-foreground">添加到当前会话，开始逐段翻译</span>
          </div>
        ) : null}
        </div>
        <div id="composer-hint" className="composer-hint">
          <span role="status">{busy ? "Agent 正在处理，请稍候…" : reviewing ? "请先审核上方译文，再继续对话" : uploading ? "正在将文件添加到会话…" : "每一段译文，都由你确认。"}</span>
          <span className="hidden shrink-0 sm:inline"><kbd>Enter</kbd> 发送<span className="mx-2">·</span><kbd>Shift + Enter</kbd> 换行</span>
        </div>
      </form>
      </div>
      </main>
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
    setUploading(true);
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
    } finally {
      setUploading(false);
    }
  }

  async function turn(body: ClientTurnBody) {
    setBusy(true);
    setError(undefined);
    setLiveText("");
    setLiveReasoning("");
    setLiveActivities([]);
    try {
      await runTurns(
        postNextTurn,
        body,
        (step) => {
          setLiveText("");
          setLiveReasoning("");
          setLiveActivities([]);
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
        },
        (event) => {
          if (event.type === "start") {
            setSessionId(event.sessionId);
          } else if (event.type === "text-delta") {
            setLiveText((current) => current + event.delta);
          } else if (event.type === "reasoning-delta") {
            // 只保留末尾片段，思考内容不做重点展示。
            setLiveReasoning((current) => (current + event.delta).slice(-160));
          } else {
            setLiveActivities((current) => {
              const index = current.findIndex((activity) => activity.id === event.id);
              if (index < 0) {
                return [...current, event];
              }
              const next = [...current];
              next[index] = event;
              return next;
            });
          }
        },
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
      setLiveText("");
      setLiveReasoning("");
      setLiveActivities([]);
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
    <li className="file-progress flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2.5">
        <FileTextIcon className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">{file.status === "done" ? <CheckIcon className="size-3" /> : null}{label}</span>
        <a className="file-download" href={downloadHref(sessionId, file.id)} aria-label={`下载译文：${file.name}`} title="下载译文">
          <ArrowDownToLineIcon className="size-4" />
          <span className="hidden sm:inline">下载译文</span>
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

function rememberSession(id: string | undefined) {
  const next = writeStoredSessionId(id, window.location, window.localStorage);
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) {
    window.history.replaceState(null, "", next);
  }
}

function downloadHref(sessionId: string | undefined, fileId: string): string {
  if (!sessionId) {
    return "#";
  }
  return `/sessions/${sessionId}/files/${fileId}/translated`;
}

// 思考过程一行带过：扫光标题 + 实时片段 + 计时（参考 ChatGPT/Cursor 的折叠思考态）。
function ThinkingTrace({ reasoning, elapsed }: { reasoning: string; elapsed: number }) {
  return (
    <Trace>
      <TraceLine status="running">
        <TraceIcon>
          <Loader2Icon className="animate-spin" />
        </TraceIcon>
        <TraceTitle>正在思考</TraceTitle>
        <span className="min-w-0 truncate text-xs text-muted-foreground/70">{reasoning}</span>
        <TraceDescription>{formatElapsed(elapsed)}</TraceDescription>
      </TraceLine>
    </Trace>
  );
}

function formatElapsed(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}m${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function ActivityTrace({ activity }: { activity: LiveActivity }) {
  const running = activity.state === "preparing" || activity.state === "running";
  return (
    <Trace>
      <TraceLine status={running ? "running" : undefined}>
        <TraceIcon>
          {running ? <Loader2Icon className="animate-spin" /> : <TerminalIcon />}
        </TraceIcon>
        <TraceTitle>{activityTitle(activity)}</TraceTitle>
      </TraceLine>
    </Trace>
  );
}

function activityTitle(activity: LiveActivity): string {
  const labels: Record<string, string> = {
    LS: "查找文件",
    Read: "读取文件",
    Translate: "翻译段落",
    WebFetch: "获取网页",
    webDocTransfer: "提取正文",
    convertHtmlToMarkdown: "转换 Markdown",
    Write: "保存文档",
  };
  const label = labels[activity.name] ?? activity.name;
  if (activity.state === "preparing") {
    return `准备 ${label}`;
  }
  if (activity.state === "running") {
    return `正在 ${label}`;
  }
  if (activity.state === "error") {
    return `${label}失败`;
  }
  return `${label}完成`;
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

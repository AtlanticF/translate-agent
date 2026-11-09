"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { cn } from "cn";
import {
  BrainIcon,
  LanguagesIcon,
  Loader2Icon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  maxSessionTitleLength,
  normalizeSessionTitle,
  type SessionSummary,
} from "../lib/session-title";

function titleFor(session: SessionSummary) {
  return normalizeSessionTitle(session.title) ?? "新会话";
}

function groupSessions(sessions: readonly SessionSummary[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const groups = ["今天", "昨天", "过去 7 天", "更早"].map((label) => ({
    label,
    sessions: [] as SessionSummary[],
  }));

  for (const session of sessions) {
    const updatedAt = new Date(session.updatedAt).getTime();
    const index = updatedAt >= today.getTime() ? 0
      : updatedAt >= yesterday.getTime() ? 1
      : updatedAt >= lastWeek.getTime() ? 2 : 3;
    groups[index].sessions.push(session);
  }
  return groups.filter((group) => group.sessions.length > 0);
}

function SessionRow({
  session, active, disabled, mobile, editing, draft,
  onDraftChange, onBeginEdit, onEditFocus, onEditBlur, onEditKeyDown, onSelect, onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  disabled: boolean;
  mobile: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (draft: string) => void;
  onBeginEdit: (session: SessionSummary) => void;
  onEditFocus: (event: FocusEvent<HTMLInputElement>, session: SessionSummary) => void;
  onEditBlur: (event: FocusEvent<HTMLInputElement>, session: SessionSummary) => void;
  onEditKeyDown: (event: KeyboardEvent<HTMLInputElement>, session: SessionSummary) => void;
  onSelect: (id: string) => void;
  onDelete: (session: SessionSummary, mobile: boolean) => void;
}) {
  const title = titleFor(session);
  return (
    <li
      data-current={active || undefined}
      className="group relative flex min-h-11 items-center rounded-xl border border-transparent pr-0.5 transition-colors hover:bg-sidebar-accent/70 data-[current=true]:border-primary/10 data-[current=true]:bg-primary/10 data-[current=true]:text-primary"
    >
      {editing ? (
        <Input
          value={draft}
          autoFocus
          maxLength={maxSessionTitleLength}
          aria-label="编辑会话标题"
          className="h-11 md:h-9"
          onChange={(event) => onDraftChange(event.target.value)}
          onFocus={(event) => onEditFocus(event, session)}
          onKeyDown={(event) => onEditKeyDown(event, session)}
          onBlur={(event) => onEditBlur(event, session)}
        />
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            aria-current={active ? "page" : undefined}
            title={title}
            className={cn("flex min-h-11 min-w-0 flex-1 items-center rounded-xl px-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:min-h-10 md:group-hover:pr-20 md:group-focus-within:pr-20 [@media(hover:none)]:pr-2.5 [@media(pointer:coarse)]:pr-2.5", active && "font-medium")}
            onClick={() => onSelect(session.id)}
            onDoubleClick={mobile ? undefined : () => onBeginEdit(session)}
          >
            <span className="truncate">{title}</span>
          </button>
          <div className="flex shrink-0 items-center rounded-lg bg-sidebar opacity-100 transition-opacity group-hover:bg-sidebar-accent group-data-[current=true]:bg-sidebar-accent md:pointer-events-none md:absolute md:right-0.5 md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:static [@media(pointer:coarse)]:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11 md:size-9"
              aria-label={`重命名会话：${title}`}
              title="重命名会话"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onBeginEdit(session)}
            >
              <PencilIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11 md:size-9"
              aria-label={`删除会话：${title}`}
              title="删除会话"
              disabled={disabled}
              onClick={() => onDelete(session, mobile)}
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function SessionSidebar({
  sessions,
  currentId,
  disabled,
  loading = false,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onOpenMemory,
}: {
  sessions: readonly SessionSummary[];
  currentId?: string;
  disabled: boolean;
  loading?: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (session: SessionSummary) => void;
  onOpenMemory: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState("");
  const editingRef = useRef<string | undefined>(undefined);
  const editReady = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const pendingDelete = useRef<SessionSummary | undefined>(undefined);
  const skipDrawerFocusRestore = useRef(false);
  const focusSearchOnExpand = useRef(false);
  const unavailable = disabled || loading;
  const search = query.trim().toLocaleLowerCase();
  const filteredSessions = search
    ? sessions.filter((session) => titleFor(session).toLocaleLowerCase().includes(search))
    : sessions;
  const groups = groupSessions(filteredSessions);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    function handleResize(event: MediaQueryListEvent) {
      if (event.matches) {
        editingRef.current = undefined;
        editReady.current = false;
        setEditingId(undefined);
        setMobileOpen(false);
      }
    }
    desktop.addEventListener("change", handleResize);
    return () => desktop.removeEventListener("change", handleResize);
  }, []);

  useEffect(() => {
    if (!collapsed && focusSearchOnExpand.current) {
      focusSearchOnExpand.current = false;
      searchRef.current?.focus();
    }
  }, [collapsed]);

  function beginEdit(session: SessionSummary) {
    if (unavailable) return;
    editReady.current = false;
    editingRef.current = session.id;
    setEditingId(session.id);
    setDraft(titleFor(session));
  }

  function cancelEdit() {
    editingRef.current = undefined;
    editReady.current = false;
    setEditingId(undefined);
  }

  function commitEdit(session: SessionSummary) {
    if (editingRef.current !== session.id) return;
    editingRef.current = undefined;
    editReady.current = false;
    setEditingId(undefined);
    const next = draft.trim().replace(/\s+/g, " ");
    if (unavailable || next === session.title) return;
    onRename(session.id, next);
  }

  function handleEditFocus(event: FocusEvent<HTMLInputElement>, session: SessionSummary) {
    event.currentTarget.select();
    requestAnimationFrame(() => {
      if (editingRef.current === session.id) editReady.current = true;
    });
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>, session: SessionSummary) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit(session);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
    }
  }

  function handleEditBlur(event: FocusEvent<HTMLInputElement>, session: SessionSummary) {
    if (editingRef.current !== session.id) return;
    if (!editReady.current) {
      event.currentTarget.focus();
      return;
    }
    commitEdit(session);
  }

  function finishEdit() {
    const id = editingRef.current;
    if (!id) return;
    const session = sessions.find((item) => item.id === id);
    if (session) commitEdit(session);
  }

  function createSession() {
    if (unavailable) return;
    finishEdit();
    setQuery("");
    setMobileOpen(false);
    onNew();
  }

  function selectSession(id: string) {
    if (unavailable) return;
    finishEdit();
    setMobileOpen(false);
    onSelect(id);
  }

  function openMemory(mobile: boolean) {
    finishEdit();
    if (mobile) {
      skipDrawerFocusRestore.current = true;
      setMobileOpen(false);
    }
    onOpenMemory();
  }

  function deleteSession(session: SessionSummary, mobile: boolean) {
    if (unavailable) return;
    if (mobile) {
      // Let the drawer finish closing before the parent's alert dialog opens.
      pendingDelete.current = session;
      skipDrawerFocusRestore.current = true;
      setMobileOpen(false);
    } else {
      onDelete(session);
    }
  }

  function expandedContent(mobile: boolean) {
    return (
      <>
        <div className="flex items-center gap-3 px-4 pb-7 pt-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LanguagesIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold tracking-tight">Translator</span>
            <span className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground">AGENT</span>
          </div>
          {mobile ? (
            <Dialog.Close
              render={<Button ref={mobileCloseRef} variant="ghost" size="icon-lg" className="size-11" />}
              aria-label="关闭会话侧栏"
            >
              <XIcon aria-hidden="true" />
            </Dialog.Close>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="收起侧栏"
              title="收起侧栏"
              aria-expanded="true"
              onClick={() => { finishEdit(); setCollapsed(true); }}
            >
              <PanelLeftCloseIcon aria-hidden="true" />
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 px-4">
          <Button type="button" size="lg" disabled={unavailable} onClick={createSession} className="h-11 w-full justify-start gap-2.5 rounded-xl px-3.5">
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            新建会话
          </Button>
          <InputGroup className="h-11 md:h-10">
            <InputGroupInput
              ref={mobile === mobileOpen ? searchRef : undefined}
              value={query}
              aria-label="搜索会话标题"
              placeholder="搜索会话…"
              className="h-full"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
                }
              }}
            />
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  className="size-11 md:size-9"
                  aria-label="清除搜索"
                  title="清除搜索"
                  onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                >
                  <XIcon aria-hidden="true" />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-7 text-xs text-muted-foreground">
          <span className="font-medium">{search ? "搜索结果" : "会话记录"}</span>
          <span className="tabular-nums" role="status" aria-label={`${filteredSessions.length} 个会话`}>
            {loading ? "…" : filteredSessions.length}
          </span>
        </div>
        <nav aria-label="翻译会话" aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5">
          {loading && sessions.length === 0 ? (
            <div role="status" className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
              <Loader2Icon className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              正在恢复会话…
            </div>
          ) : filteredSessions.length === 0 ? (
            <div role="status" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-accent text-muted-foreground">
                {search ? <SearchXIcon className="size-5" aria-hidden="true" /> : <MessageSquareIcon className="size-5" aria-hidden="true" />}
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{search ? "没有找到相关会话" : "还没有会话"}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{search ? "换个关键词，或清除搜索试试。" : "开启新会话，让好文字跨越语言。"}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <section key={group.label} aria-label={group.label} className="flex flex-col gap-1.5">
                  <h3 className="flex items-center justify-between px-2 text-[11px] font-medium text-muted-foreground">
                    {group.label}
                    <span className="tabular-nums">{group.sessions.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {group.sessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        active={session.id === currentId}
                        disabled={unavailable}
                        mobile={mobile}
                        editing={mobile === mobileOpen && editingId === session.id}
                        draft={draft}
                        onDraftChange={setDraft}
                        onBeginEdit={beginEdit}
                        onEditFocus={handleEditFocus}
                        onEditBlur={handleEditBlur}
                        onEditKeyDown={handleEditKeyDown}
                        onSelect={selectSession}
                        onDelete={deleteSession}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </nav>
        <footer className="flex shrink-0 items-center border-t border-sidebar-border px-3 py-3">
          <Button type="button" variant="ghost" size="lg" className="h-11 w-full justify-start gap-2.5 rounded-xl px-2.5 text-[13px] text-muted-foreground md:h-10" onClick={() => openMemory(mobile)}>
            <BrainIcon aria-hidden="true" />
            记忆管理
          </Button>
        </footer>
      </>
    );
  }

  return (
    <>
      <aside aria-label="会话侧栏" className={cn("hidden h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex", collapsed ? "w-[68px]" : "w-[264px]")}>
        {collapsed ? (
          <>
            <div className="flex flex-col items-center gap-4 px-3 pb-5 pt-6">
              <div title="Translator Agent" className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LanguagesIcon className="size-5" aria-hidden="true" />
                <span className="sr-only">Translator Agent</span>
              </div>
              <Button type="button" variant="ghost" size="icon-lg" aria-label="展开侧栏" title="展开侧栏" aria-expanded="false" onClick={() => setCollapsed(false)}>
                <PanelLeftOpenIcon aria-hidden="true" />
              </Button>
              <Button type="button" size="icon-lg" className="size-11 rounded-xl" aria-label="新建会话" title="新建会话" disabled={unavailable} onClick={createSession}>
                <PlusIcon aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-lg" aria-label="搜索会话" title="搜索会话" onClick={() => { focusSearchOnExpand.current = true; setCollapsed(false); }}>
                <SearchIcon aria-hidden="true" />
              </Button>
            </div>
            <nav aria-label="翻译会话" aria-busy={loading} className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-2 pb-4">
              <span className="mb-1 text-[10px] tabular-nums text-muted-foreground" aria-label={`${sessions.length} 个会话`}>{loading ? "…" : sessions.length}</span>
              {sessions.map((session) => (
                <Button
                  key={session.id}
                  type="button"
                  variant={session.id === currentId ? "secondary" : "ghost"}
                  size="icon-lg"
                  aria-label={titleFor(session)}
                  title={titleFor(session)}
                  aria-current={session.id === currentId ? "page" : undefined}
                  disabled={unavailable}
                  onClick={() => selectSession(session.id)}
                >
                  <MessageSquareIcon aria-hidden="true" />
                </Button>
              ))}
            </nav>
            <footer className="flex justify-center border-t border-sidebar-border py-3">
              <Button type="button" variant="ghost" size="icon-lg" className="text-muted-foreground" aria-label="记忆管理" title="记忆管理" onClick={() => openMemory(false)}>
                <BrainIcon aria-hidden="true" />
              </Button>
            </footer>
          </>
        ) : !mobileOpen ? expandedContent(false) : null}
      </aside>

      <Dialog.Root
        open={mobileOpen}
        onOpenChange={(open) => {
          if (open && window.matchMedia("(min-width: 768px)").matches) return;
          if (open) {
            skipDrawerFocusRestore.current = false;
            cancelEdit();
          } else {
            finishEdit();
          }
          setMobileOpen(open);
        }}
        onOpenChangeComplete={(open) => {
          if (!open && pendingDelete.current) {
            const session = pendingDelete.current;
            pendingDelete.current = undefined;
            onDelete(session);
          }
        }}
      >
        <Dialog.Trigger render={<Button type="button" variant="outline" size="icon-lg" className="absolute top-4 left-4 z-20 size-11 rounded-xl md:hidden" />} aria-label="打开会话侧栏">
          <PanelLeftOpenIcon aria-hidden="true" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-foreground/20 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none" />
          <Dialog.Popup
            initialFocus={mobileCloseRef}
            finalFocus={() => !skipDrawerFocusRestore.current && !window.matchMedia("(min-width: 768px)").matches}
            className="fixed inset-y-0 left-0 flex h-dvh w-[min(320px,calc(100vw-32px))] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl outline-none transition-transform duration-200 data-starting-style:-translate-x-full data-ending-style:-translate-x-full motion-reduce:transition-none"
          >
            <Dialog.Title className="sr-only">翻译会话</Dialog.Title>
            <Dialog.Description className="sr-only">搜索、切换和管理翻译会话，或新建会话。</Dialog.Description>
            {expandedContent(true)}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

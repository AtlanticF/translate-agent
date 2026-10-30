"use client";

import { useRef, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maxSessionTitleLength, type SessionSummary } from "../lib/session-title";

export function SessionSidebar({
  sessions,
  currentId,
  disabled,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: readonly SessionSummary[];
  currentId?: string;
  disabled: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (session: SessionSummary) => void;
}) {
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState("");
  const editingRef = useRef<string | undefined>(undefined);
  const editReady = useRef(false);

  function beginEdit(session: SessionSummary) {
    if (disabled) {
      return;
    }
    editReady.current = false;
    editingRef.current = session.id;
    setEditingId(session.id);
    setDraft(session.title);
  }

  function cancelEdit() {
    editingRef.current = undefined;
    setEditingId(undefined);
  }

  function commitEdit(session: SessionSummary) {
    if (editingRef.current !== session.id) {
      return;
    }
    editingRef.current = undefined;
    setEditingId(undefined);
    const next = draft.trim().replace(/\s+/g, " ");
    if (next === session.title) {
      return;
    }
    onRename(session.id, next);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r p-3">
      <Button type="button" variant="outline" disabled={disabled} onClick={onNew}>
        New session
      </Button>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sessions.map((session) => (
          <div
            key={session.id}
            data-current={session.id === currentId ? "true" : undefined}
            className="group flex items-center gap-0.5 rounded-md pr-1 hover:bg-muted data-[current=true]:bg-muted"
          >
            {editingId === session.id ? (
              <Input
                value={draft}
                autoFocus
                maxLength={maxSessionTitleLength}
                aria-label="编辑会话标题"
                className="h-8"
                onChange={(event) => setDraft(event.target.value)}
                onFocus={(event) => {
                  event.currentTarget.select();
                  requestAnimationFrame(() => {
                    editReady.current = true;
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitEdit(session);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEdit();
                  }
                }}
                onBlur={(event) => {
                  if (!editReady.current) {
                    event.currentTarget.focus();
                    return;
                  }
                  commitEdit(session);
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  className="min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm disabled:opacity-50"
                  onClick={() => onSelect(session.id)}
                  onDoubleClick={() => beginEdit(session)}
                >
                  <span className="line-clamp-2">{session.title}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`重命名会话：${session.title}`}
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => beginEdit(session)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`删除会话：${session.title}`}
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(session)}
                >
                  <Trash2Icon />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

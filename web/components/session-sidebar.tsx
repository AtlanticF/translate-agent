"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionSummary } from "../lib/session-title";

export function SessionSidebar({
  sessions,
  currentId,
  disabled,
  onNew,
  onSelect,
  onDelete,
}: {
  sessions: readonly SessionSummary[];
  currentId?: string;
  disabled: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (session: SessionSummary) => void;
}) {
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
            <button
              type="button"
              disabled={disabled}
              className="min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm disabled:opacity-50"
              onClick={() => onSelect(session.id)}
            >
              <span className="line-clamp-2">{session.title}</span>
            </button>
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
          </div>
        ))}
      </div>
    </aside>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import type { SessionSummary } from "../lib/session-title";

export function SessionSidebar({
  sessions,
  currentId,
  disabled,
  onNew,
  onSelect,
}: {
  sessions: readonly SessionSummary[];
  currentId?: string;
  disabled: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r p-3">
      <Button type="button" variant="outline" disabled={disabled} onClick={onNew}>
        New session
      </Button>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            disabled={disabled}
            data-current={session.id === currentId ? "true" : undefined}
            className="rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 data-[current=true]:bg-muted"
            onClick={() => onSelect(session.id)}
          >
            <span className="line-clamp-2">{session.title}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { BrainIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MemoryItem } from "../../src/memory/memory";

// 只读浏览 + 删除：记忆由 Agent 在审核反馈后自动维护，这里不提供新增和修改。
export function MemoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(640px,calc(100dvh-32px))] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none transition duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none">
          <MemoryPanel />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// 弹窗关闭时 Popup 会卸载，所以每次打开都是全新状态并重新加载。
function MemoryPanel() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<number>();
  const [removing, setRemoving] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    request("/memories")
      .then(setItems)
      .catch((caught) => setError(message(caught)))
      .finally(() => setLoading(false));
  }, []);

  async function remove(index: number) {
    setRemoving(index);
    setError(undefined);
    try {
      setItems(await request(`/memories/${index}`, { method: "DELETE" }));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setConfirming(undefined);
      setRemoving(undefined);
    }
  }

  return (
    <>
          <div className="flex items-center gap-3 px-5 pt-5 pb-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BrainIcon className="size-5" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Dialog.Title className="text-[15px] font-semibold tracking-tight">记忆管理</Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                Agent 从你的审核反馈中自动学到的偏好，只能浏览和删除。
              </Dialog.Description>
            </div>
            <Dialog.Close render={<Button variant="ghost" size="icon-lg" aria-label="关闭记忆管理" />}>
              <XIcon aria-hidden="true" />
            </Dialog.Close>
          </div>

          {error ? (
            <p role="alert" className="mx-5 mb-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm wrap-anywhere text-destructive">
              {error}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5">
            {loading ? (
              <div role="status" className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
                <Loader2Icon className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                正在加载记忆…
              </div>
            ) : items.length === 0 ? (
              <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">
                还没有记忆。多审核几段译文，Agent 会逐渐记住你的偏好。
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5" aria-label="记忆列表">
                {items.map((item) => (
                  <li key={item.index} className="flex items-start gap-2 rounded-xl px-2 py-2 hover:bg-muted/60">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-1.5 py-1">
                      <p className="text-sm leading-relaxed wrap-anywhere">{item.text}</p>
                      {item.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {confirming === item.index ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" disabled={removing !== undefined} onClick={() => setConfirming(undefined)}>
                          取消
                        </Button>
                        <Button type="button" variant="destructive" size="sm" disabled={removing !== undefined} onClick={() => void remove(item.index)}>
                          {removing === item.index ? <Loader2Icon className="animate-spin" /> : null}
                          确认删除
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className="shrink-0"
                        aria-label={`删除记忆：${item.text}`}
                        title="删除记忆"
                        disabled={removing !== undefined}
                        onClick={() => setConfirming(item.index)}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
    </>
  );
}

async function request(url: string, init?: RequestInit): Promise<MemoryItem[]> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => undefined)) as
    | { memories: MemoryItem[] }
    | { error?: string }
    | undefined;
  if (!response.ok || !payload || !("memories" in payload)) {
    throw new Error((payload && "error" in payload && payload.error) || "request failed");
  }
  return payload.memories;
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

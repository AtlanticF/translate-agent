"use client";

import { useEffect, useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

export default function Home() {
  const [text, setText] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void fetch("/next")
      .then((response) => response.json())
      .then((body: { text: string }) => {
        if (!cancelled) {
          setText(body.text);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MessageScrollerProvider>
      <MessageScroller className="min-h-dvh">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
            {text ? (
              <MessageScrollerItem messageId="hello">
                <Message>
                  <MessageContent>
                    <Bubble variant="muted">
                      <BubbleContent>{text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

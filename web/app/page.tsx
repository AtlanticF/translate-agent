"use client";

import { useState } from "react";
import { Welcome } from "@/components/welcome";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
import { inputPlaceholder, submittedUserText } from "../../shared/welcome";

export default function Home() {
  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  function submit() {
    const text = submittedUserText(draft);
    if (!text) {
      return;
    }
    setMessages((current) => [...current, text]);
    setDraft("");
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1">
        {messages.length === 0 ? <Welcome /> : <Conversation messages={messages} />}
      </div>
      <form
        className="mx-auto w-full max-w-3xl px-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            value={draft}
            placeholder={inputPlaceholder}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupButton type="submit" size="sm">
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

function Conversation({ messages }: { messages: readonly string[] }) {
  return (
    <MessageScrollerProvider>
      <MessageScroller className="h-full">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
            {messages.map((text, index) => (
              <MessageScrollerItem key={`${index}-${text}`} messageId={String(index)}>
                <Message align="end">
                  <MessageContent>
                    <Bubble align="end" variant="muted">
                      <BubbleContent>{text}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

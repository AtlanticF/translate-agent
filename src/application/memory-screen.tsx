import { Box, Text } from "ink";
import type { ModelMessage } from "ai";
import type { ReactElement } from "react";
import { TranscriptView } from "./transcript-view.js";
import { UserScreen } from "./user-screen.js";

export type MemoryLine = {
  text: string;
  tags: readonly string[];
};

export function memoryLine(item: MemoryLine): string {
  const style = item.tags.join(", ");
  return style === "" ? item.text : `${item.text}  ${style}`;
}

export function MemoryScreen({
  messages,
  items,
  notice,
  onSubmit,
}: {
  messages: readonly ModelMessage[];
  items: readonly MemoryLine[];
  notice?: string;
  onSubmit: (text: string) => void;
}): ReactElement {
  return (
    <Box flexDirection="column">
      <TranscriptView messages={messages} />
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
        <Text bold color="cyan">
          memory
        </Text>
        {items.length === 0 ? (
          <Text dimColor>No memory.</Text>
        ) : (
          items.map((item, index) => (
            <Text key={`${item.text}-${index}`} color="white">
              {memoryLine(item)}
            </Text>
          ))
        )}
      </Box>
      <UserScreen inputOnly messages={[]} notice={notice} onSubmit={onSubmit} />
    </Box>
  );
}

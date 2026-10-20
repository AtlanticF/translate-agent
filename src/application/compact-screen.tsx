import { useSpinner } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ModelMessage } from "ai";
import type { ReactElement } from "react";
import { TranscriptView } from "./transcript-view.js";
import { UserScreen } from "./user-screen.js";

export const compactingLabel = "Compacting ...";

export function CompactScreen({
  messages,
  result,
  notice,
  onSubmit,
}: {
  messages: readonly ModelMessage[];
  result?: { analysis: string; summary: string };
  notice?: string;
  onSubmit?: (text: string) => void;
}): ReactElement {
  return (
    <Box flexDirection="column">
      <TranscriptView messages={messages} />
      {result ? <CompactResult analysis={result.analysis} summary={result.summary} /> : <CompactingBox />}
      {result && onSubmit ? (
        <UserScreen inputOnly messages={[]} notice={notice} onSubmit={onSubmit} />
      ) : null}
    </Box>
  );
}

function CompactingBox(): ReactElement {
  const { frame } = useSpinner({});
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1} gap={1}>
      <Text color="white">{frame}</Text>
      <Text color="cyan">{compactingLabel}</Text>
    </Box>
  );
}

function CompactResult({
  analysis,
  summary,
}: {
  analysis: string;
  summary: string;
}): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
      <Text bold color="cyan">
        analysis
      </Text>
      <Text color="white">{analysis}</Text>
      <Box marginTop={1}>
        <Text bold color="cyan">
          summary
        </Text>
      </Box>
      <Text dimColor>{summary}</Text>
    </Box>
  );
}

import { useSpinner } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { ModelMessage } from "ai";
import { processingLabel, transcriptBlocks, type TranscriptBlock } from "./transcript.js";

export function TranscriptView({
  messages,
}: {
  messages: readonly ModelMessage[];
}): ReactElement {
  return (
    <Box flexDirection="column">
      {transcriptBlocks(messages).map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </Box>
  );
}

export function ProcessingBox(): ReactElement {
  const { frame } = useSpinner({});
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1} gap={1}>
      <Text color="white">{frame}</Text>
      <Text color="cyan">{processingLabel}</Text>
    </Box>
  );
}

function BlockView({ block }: { block: TranscriptBlock }): ReactElement | null {
  if (block.kind === "user") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="cyan">
          user:
        </Text>
        <Text color="white">{block.text}</Text>
      </Box>
    );
  }

  if (!block.text && block.tools.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        assistant:
      </Text>
      {block.text ? <Text>{block.text}</Text> : null}
      {block.tools.map((tool) => (
        <Box key={tool.callId} flexDirection="column">
          <Text bold color="cyan">
            tool:
          </Text>
          <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
            {tool.lines.map((line, index) => (
              <Text key={index} bold={index === 0} color={index === 0 ? "yellow" : undefined} dimColor={index > 0}>
                {line}
              </Text>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

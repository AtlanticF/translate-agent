import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { Paragraph } from "./paragraphs.js";

type PaneProps = {
  paragraphs: readonly Paragraph[];
};

export function SourcePane({ paragraphs }: PaneProps): ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0}>
      <Text dimColor>原文</Text>
      {paragraphs.map((paragraph) => (
        <ParagraphText
          key={paragraph.id}
          text={paragraph.src}
          active={paragraph.status === "current"}
        />
      ))}
    </Box>
  );
}

export function TranslationPane({ paragraphs }: PaneProps): ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0}>
      <Text dimColor>译文</Text>
      {paragraphs.map((paragraph) => (
        <Box key={paragraph.id} flexDirection="column">
          <ParagraphText
            text={paragraph.translation}
            active={paragraph.status === "current"}
          />
          <Text color={statusColor(paragraph.status)} dimColor={paragraph.status !== "current"}>
            {statusLabel(paragraph.status)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function ParagraphText({ text, active }: { text: string; active: boolean }): ReactElement {
  if (active) {
    return (
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text>{text}</Text>
      </Box>
    );
  }
  return <Text dimColor>{text}</Text>;
}

function statusLabel(status: Paragraph["status"]): string {
  if (status === "done") {
    return "已完成";
  }
  if (status === "current") {
    return "当前";
  }
  return "未开始";
}

function statusColor(status: Paragraph["status"]): "green" | "cyan" | "gray" {
  if (status === "done") {
    return "green";
  }
  if (status === "current") {
    return "cyan";
  }
  return "gray";
}

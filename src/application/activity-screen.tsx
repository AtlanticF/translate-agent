import { Box, useInput } from "ink";
import type { ModelMessage } from "ai";
import type { ReactElement } from "react";
import { ProcessingBox, TranscriptView } from "./transcript-view.js";

type ActivityScreenProps = {
  messages: readonly ModelMessage[];
  processing: boolean;
  onStop?: () => void;
};

export function ActivityScreen({
  messages,
  processing,
  onStop,
}: ActivityScreenProps): ReactElement {
  useInput((_input, key) => {
    if (key.escape) {
      onStop?.();
    }
  });

  return (
    <Box flexDirection="column">
      <TranscriptView messages={messages} />
      {processing ? <ProcessingBox /> : null}
    </Box>
  );
}

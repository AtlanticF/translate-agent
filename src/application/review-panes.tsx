import { Box, Text } from "ink";
import type { ReactElement } from "react";

type ReviewColumnsProps = {
  source: string;
  translation: string;
  direction: "row" | "column";
};

export function ReviewColumns({
  source,
  translation,
  direction,
}: ReviewColumnsProps): ReactElement {
  return (
    <Box flexDirection={direction}>
      <Box flexGrow={1} flexBasis={0} marginRight={direction === "row" ? 1 : 0}>
        <Text>{source}</Text>
      </Box>
      <Box flexGrow={1} flexBasis={0} marginTop={direction === "column" ? 1 : 0}>
        <Text>{translation}</Text>
      </Box>
    </Box>
  );
}

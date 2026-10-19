import { Spinner, StatusMessage } from "@inkjs/ui";
import { Box } from "ink";
import type { ReactElement } from "react";
import type { ActivityItem } from "./activity.js";

type ActivityScreenProps = {
  items: readonly ActivityItem[];
  waiting: string;
};

export function ActivityScreen({ items, waiting }: ActivityScreenProps): ReactElement {
  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <StatusMessage key={index} variant={item.variant}>
          {item.text}
        </StatusMessage>
      ))}
      <Spinner label={waiting} />
    </Box>
  );
}

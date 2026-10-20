import type { ModelMessage } from "ai";
import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { TranscriptView } from "./transcript-view.js";

type UserScreenProps = {
  messages: readonly ModelMessage[];
  onSubmit: (text: string) => void;
};

export const welcomeTitle = "Welcome to Translator Agent!";

export const welcomeDescription = [
  "A powerful translation tool that drafts one paragraph at a time.",
  "You approve, refine, or reject each draft before it is saved.",
];

export const exampleHeading = "Here are some example prompts to get you started:";

export const examplePrompts = [
  "Translate this text to Chinese: Hello, welcome aboard.",
  "Help me translate this README into Chinese.",
  "Translate /tmp/guide.md into English, one paragraph at a time.",
  "Read the file, then keep product names in English.",
];

export const welcomeHint = "Type your message below to start translating! ✨";

export const inputPlaceholder = "Type your prompt ...";

// 输入框常带空白。去掉首尾空白后如果没有内容，就不提交。
export function submittedUserText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function UserScreen({ messages, onSubmit }: UserScreenProps): ReactElement {
  return (
    <Box flexDirection="column">
      {messages.length === 0 ? <Welcome /> : <TranscriptView messages={messages} />}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
        <TextInput
          placeholder={inputPlaceholder}
          onSubmit={(value) => {
            const next = submittedUserText(value);
            if (next !== undefined) {
              onSubmit(next);
            }
          }}
        />
      </Box>
    </Box>
  );
}

function Welcome(): ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {welcomeTitle}
      </Text>
      {welcomeDescription.map((line) => (
        <Text key={line} color="white">
          {line}
        </Text>
      ))}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>{exampleHeading}</Text>
        {examplePrompts.map((prompt, index) => (
          <Text key={prompt} dimColor>
            {`  ${index + 1}. "${prompt}"`}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor italic>
          {welcomeHint}
        </Text>
      </Box>
    </Box>
  );
}


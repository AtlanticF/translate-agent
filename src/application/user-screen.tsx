import type { ModelMessage } from "ai";
import { TextInput } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import { useState, type ReactElement } from "react";
import {
  commandToSubmit,
  commandsForInput,
  nextCommandIndex,
} from "./commands.js";
import { TranscriptView } from "./transcript-view.js";

type UserScreenProps = {
  messages: readonly ModelMessage[];
  notice?: string;
  initialValue?: string;
  inputOnly?: boolean;
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

export function UserScreen({
  messages,
  notice,
  initialValue = "",
  inputOnly = false,
  onSubmit,
}: UserScreenProps): ReactElement {
  const [draft, setDraft] = useState(initialValue);
  const [selected, setSelected] = useState(0);
  const listed = commandsForInput(draft);

  useInput((_input, key) => {
    if (listed.length === 0) {
      return;
    }
    if (key.upArrow) {
      setSelected((current) => nextCommandIndex(current, "up", listed.length));
    }
    if (key.downArrow) {
      setSelected((current) => nextCommandIndex(current, "down", listed.length));
    }
  });

  return (
    <Box flexDirection="column">
      {inputOnly ? null : messages.length === 0 ? <Welcome /> : <TranscriptView messages={messages} />}
      {notice ? <Text color="yellow">{notice}</Text> : null}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginTop={1}>
        <TextInput
          defaultValue={initialValue}
          placeholder={inputPlaceholder}
          onChange={setDraft}
          onSubmit={(value) => {
            const next = submittedUserText(value);
            if (next === undefined) {
              return;
            }
            onSubmit(commandToSubmit(next, selected));
          }}
        />
      </Box>
      {listed.length > 0 ? (
        <Box flexDirection="column">
          {listed.map((command, index) => (
            <Text
              key={command.name}
              bold={index === selected}
              color={index === selected ? "cyan" : undefined}
              dimColor={index !== selected}
            >
              {`/${command.name}  ${command.description}`}
            </Text>
          ))}
        </Box>
      ) : null}
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


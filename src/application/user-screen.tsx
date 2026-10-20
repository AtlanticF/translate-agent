import type { ModelMessage } from "ai";
import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ReactElement } from "react";

type UserScreenProps = {
  messages: readonly ModelMessage[];
  onSubmit: (text: string) => void;
};

export const appName = "translate-agent";

// 用方块字符拼标志，终端里不需要图片。
export const logo = ` ▝▜▙ 
▗▟▀▀▘
 ▝▜▙ 
▗▟▀▀▘`;

export const welcome = "把目录或文件的绝对路径发给我。我会逐段翻译，每一段等你审核。";

export const inputPlaceholder = "输入消息";

// 输入框常带空白。去掉首尾空白后如果没有内容，就不提交。
export function submittedUserText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function UserScreen({ messages, onSubmit }: UserScreenProps): ReactElement {
  return (
    <Box flexDirection="column">
      {messages.length === 0 ? <Welcome /> : <MessageList messages={messages} />}
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
      <Box>
        <Text color="white">{logo}</Text>
        <Box marginLeft={2}>
          <Text color="white">{appName}</Text>
        </Box>
      </Box>
      <Text color="white">{welcome}</Text>
      <Text color="white">LS         列出目录</Text>
      <Text color="white">Read       读取文件</Text>
      <Text color="white">Translate  提交一段译文</Text>
    </Box>
  );
}

function MessageList({ messages }: { messages: readonly ModelMessage[] }): ReactElement {
  return (
    <Box flexDirection="column">
      {messages.map((message, index) => (
        <Text key={index}>
          <Text dimColor>{roleLabel(message.role)} </Text>
          {messageText(message)}
        </Text>
      ))}
    </Box>
  );
}

function roleLabel(role: ModelMessage["role"]): string {
  if (role === "user") {
    return "用户";
  }
  if (role === "assistant") {
    return "助手";
  }
  if (role === "tool") {
    return "工具";
  }
  return "系统";
}

function messageText(message: ModelMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .map((part) => {
      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }
      if ("toolName" in part && typeof part.toolName === "string") {
        return part.toolName;
      }
      return part.type;
    })
    .join("\n");
}

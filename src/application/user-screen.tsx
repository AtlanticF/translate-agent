import type { ModelMessage } from "ai";
import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type { ReactElement } from "react";

type UserScreenProps = {
  messages: readonly ModelMessage[];
  onSubmit: (text: string) => void;
};

export const welcome = `我是翻译助手。

告诉我要翻译的目录或文件，我会按段落翻译，每一段都等你审核。

工具
LS         列出目录里的文件
Read       读取文件的最新内容
Translate  提交一段译文。你可以选择通过、拒绝或修改

在下面输入目录或文件的绝对路径，回车开始。`;

export const inputPlaceholder = "输入消息";

// 编辑器或输入框常带空白。去掉首尾空白后如果没有内容，就不提交。
export function submittedUserText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function UserScreen({ messages, onSubmit }: UserScreenProps): ReactElement {
  return (
    <Box flexDirection="column">
      {messages.length === 0 ? (
        <Text>{welcome}</Text>
      ) : (
        messages.map((message, index) => (
          <Text key={index}>
            {roleLabel(message.role)}: {messageText(message)}
          </Text>
        ))
      )}
      <Box>
        <Text>{"> "}</Text>
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

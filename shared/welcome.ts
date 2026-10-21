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

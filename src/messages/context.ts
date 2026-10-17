import type { ModelMessage } from "ai";

export class Context<TMessage extends ModelMessage = ModelMessage> {
  private readonly messages: TMessage[];

  constructor(messages: readonly TMessage[] = []) {
    this.messages = [...messages];
  }

  addMessages(messages: readonly TMessage[]): void {
    this.messages.push(...messages);
  }

  getMessages(): readonly TMessage[] {
    return [...this.messages];
  }

  toModelMessages(): ModelMessage[] {
    return this.messages.map((message) => toModelMessage(message));
  }
}

function toModelMessage(message: ModelMessage): ModelMessage {
  const modelMessage = {
    role: message.role,
    content: message.content,
    ...(message.providerOptions
      ? { providerOptions: message.providerOptions }
      : {}),
  };

  // ModelMessage 是联合类型，role 和 content 从同一条消息拷出。
  return modelMessage as ModelMessage;
}

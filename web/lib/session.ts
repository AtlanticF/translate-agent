import type { Context, CopilotResponseEntry } from "../../src/messages/context";

export type ContextMessage = ReturnType<Context["getMessages"]>[number];

export type Session = {
  id: string;
  messages: ContextMessage[];
  copilotResponses: CopilotResponseEntry[];
  createdAt: Date;
  updatedAt: Date;
};

export type SessionCreate = {
  id?: string;
  messages?: ContextMessage[];
  copilotResponses?: CopilotResponseEntry[];
};

export type SessionPatch = {
  messages?: ContextMessage[];
  copilotResponses?: CopilotResponseEntry[];
};

export interface SessionStore {
  create(input?: SessionCreate): Promise<Session>;
  list(): Promise<Session[]>;
  get(id: string): Promise<Session | undefined>;
  update(id: string, patch: SessionPatch): Promise<Session>;
  delete(id: string): Promise<void>;
}

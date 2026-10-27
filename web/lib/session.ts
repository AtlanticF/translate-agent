import type { Context, CopilotResponseEntry } from "../../src/messages/context";

export type ContextMessage = ReturnType<Context["getMessages"]>[number];

export type Session = {
  id: string;
  userId: string | null;
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

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`unknown session: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export interface SessionStore {
  create(userId: string, input?: SessionCreate): Promise<Session>;
  ensure(userId: string, input: SessionCreate & { id: string }): Promise<Session | undefined>;
  list(userId: string): Promise<Session[]>;
  get(userId: string, id: string): Promise<Session | undefined>;
  update(userId: string, id: string, patch: SessionPatch): Promise<Session>;
  delete(userId: string, id: string): Promise<void>;
}

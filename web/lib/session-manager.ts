import "server-only";
import type { Context, CopilotResponseEntry } from "../../src/messages/context";

// Context.messages，也就是 getMessages() 返回的那份。
type ContextMessage = ReturnType<Context["getMessages"]>[number];

export type Session = {
  id: string;
  messages: ContextMessage[];
  copilotResponses: CopilotResponseEntry[];
};

export function createSessionManager() {
  const sessions = new Map<string, Session>();

  return {
    createSession(): Session {
      const session: Session = {
        id: crypto.randomUUID(),
        messages: [],
        copilotResponses: [],
      };
      sessions.set(session.id, session);
      return copySession(session);
    },

    getSession(id: string): Session | undefined {
      const session = sessions.get(id);
      return session ? copySession(session) : undefined;
    },

    addMessages(id: string, messages: readonly ContextMessage[]): Session {
      const session = sessions.get(id);
      if (!session) {
        throw new Error(`unknown session: ${id}`);
      }
      session.messages.push(...messages);
      return copySession(session);
    },

    addCopilotResponses(id: string, responses: readonly CopilotResponseEntry[]): Session {
      const session = sessions.get(id);
      if (!session) {
        throw new Error(`unknown session: ${id}`);
      }
      session.copilotResponses.push(...responses);
      return copySession(session);
    },
  };
}

export const sessionManager = createSessionManager();

function copySession(session: Session): Session {
  return {
    id: session.id,
    messages: [...session.messages],
    copilotResponses: [...session.copilotResponses],
  };
}

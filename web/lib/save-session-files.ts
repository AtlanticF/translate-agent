import type { SessionFile, SessionFileStore } from "./session-files";
import { SessionNotFoundError, type SessionStore } from "./session";

export async function saveUploadedFiles(
  sessions: SessionStore,
  files: SessionFileStore,
  userId: string,
  sessionId: string,
  uploads: { name: string; mediaType: string; bytes: Uint8Array }[],
): Promise<{ sessionId: string; files: SessionFile[] }> {
  const session = await sessions.ensure(userId, { id: sessionId });
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }
  for (const upload of uploads) {
    await files.add(sessionId, upload);
  }
  return { sessionId, files: await files.list(sessionId) };
}

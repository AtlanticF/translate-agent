import type { SessionFile, SessionFileStore } from "./session-files";
import type { SessionStore } from "./session";

export async function saveUploadedFiles(
  sessions: SessionStore,
  files: SessionFileStore,
  sessionId: string,
  uploads: { name: string; mediaType: string; bytes: Uint8Array }[],
): Promise<{ sessionId: string; files: SessionFile[] }> {
  const existing = await sessions.get(sessionId);
  if (!existing) {
    await sessions.create({ id: sessionId });
  }
  for (const upload of uploads) {
    await files.add(sessionId, upload);
  }
  return { sessionId, files: await files.list(sessionId) };
}

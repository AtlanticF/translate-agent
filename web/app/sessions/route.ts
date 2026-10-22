import { getSessionStore } from "../../lib/session-cloudflare";
import { sessionTitle } from "../../lib/session-title";

export async function GET() {
  const sessions = await getSessionStore();
  const listed = await sessions.list();
  return Response.json({
    sessions: listed.map((session) => ({
      id: session.id,
      title: sessionTitle(session.messages),
      updatedAt: session.updatedAt.toISOString(),
    })),
  });
}

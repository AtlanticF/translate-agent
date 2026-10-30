import { requireUserId } from "../../lib/request-auth";
import { getSessionStore } from "../../lib/session-cloudflare";
import { displaySessionTitle } from "../../lib/session-title";

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const sessions = await getSessionStore();
  const listed = await sessions.list(auth.userId);
  return Response.json({
    sessions: listed.map((session) => ({
      id: session.id,
      title: displaySessionTitle(session),
      updatedAt: session.updatedAt.toISOString(),
    })),
  });
}

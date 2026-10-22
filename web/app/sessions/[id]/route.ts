import { getSessionStore } from "../../../lib/session-cloudflare";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sessions = await getSessionStore();
  const session = await sessions.get(id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json({
    id: session.id,
    messages: session.messages,
  });
}

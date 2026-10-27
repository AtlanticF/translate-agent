import { requireUserId } from "../../../lib/request-auth";
import { SessionNotFoundError } from "../../../lib/session";
import { getSessionFileStore, getSessionStore } from "../../../lib/session-cloudflare";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const { id } = await context.params;
  const sessions = await getSessionStore();
  const session = await sessions.get(auth.userId, id);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  const files = await getSessionFileStore();
  return Response.json({
    id: session.id,
    messages: session.messages,
    files: await files.list(id),
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const { id } = await context.params;
  try {
    await (await getSessionStore()).delete(auth.userId, id);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    throw error;
  }
  return new Response(null, { status: 204 });
}

import { requireUserId } from "../../../lib/request-auth";
import { SessionNotFoundError } from "../../../lib/session";
import { getSessionFileStore, getSessionStore } from "../../../lib/session-cloudflare";
import { displaySessionTitle, readSessionTitle } from "../../../lib/session-title";

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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => undefined)) as { title?: unknown } | undefined;
  if (!body || typeof body !== "object" || !("title" in body)) {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  const parsed = readSessionTitle(body.title);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const session = await (await getSessionStore()).update(auth.userId, id, { title: parsed.title });
    return Response.json({
      id: session.id,
      title: displaySessionTitle(session),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    throw error;
  }
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

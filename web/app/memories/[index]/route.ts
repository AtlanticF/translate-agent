import { requireUserId } from "../../../lib/request-auth";
import { getUserMemoryStore } from "../../../lib/session-cloudflare";

export async function DELETE(request: Request, context: { params: Promise<{ index: string }> }) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const index = Number((await context.params).index);
  if (!Number.isInteger(index) || index < 0) {
    return Response.json({ error: "invalid memory index" }, { status: 400 });
  }
  const memories = await (await getUserMemoryStore(auth.userId)).remove(index);
  return Response.json({ memories });
}

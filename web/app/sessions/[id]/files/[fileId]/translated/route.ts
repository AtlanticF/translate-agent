import { requireUserId } from "../../../../../../lib/request-auth";
import { getSessionFileStore, getSessionStore } from "../../../../../../lib/session-cloudflare";
import { translatedDownloadName } from "../../../../../../lib/session-files";

export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const { id, fileId } = await context.params;
  const sessions = await getSessionStore();
  if (!(await sessions.get(auth.userId, id))) {
    return Response.json({ error: "file not found" }, { status: 404 });
  }
  const files = await getSessionFileStore();
  const file = await files.get(id, fileId);
  if (!file) {
    return Response.json({ error: "file not found" }, { status: 404 });
  }
  const text = await files.readTranslated(id, fileId);
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${translatedDownloadName(file.name)}"`,
    },
  });
}

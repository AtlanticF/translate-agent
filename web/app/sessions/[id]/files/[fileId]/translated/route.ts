import { getSessionFileStore } from "../../../../../../lib/session-cloudflare";
import { translatedDownloadName } from "../../../../../../lib/session-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await context.params;
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

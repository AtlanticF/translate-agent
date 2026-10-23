import { getSessionFileStore, getSessionStore } from "../../../../lib/session-cloudflare";
import { saveUploadedFiles } from "../../../../lib/save-session-files";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const form = await request.formData();
  const uploads = form.getAll("file").filter((item): item is File => item instanceof File);
  if (uploads.length === 0) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const saved = await saveUploadedFiles(
      await getSessionStore(),
      await getSessionFileStore(),
      id,
      await Promise.all(
        uploads.map(async (file) => ({
          name: file.name,
          mediaType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ),
    );
    return Response.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("10MB") ? 413 : 400;
    return Response.json({ error: message }, { status });
  }
}

import { requireUserId } from "../../lib/request-auth";
import { getUserMemoryStore } from "../../lib/session-cloudflare";

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if ("response" in auth) {
    return auth.response;
  }
  const memories = await (await getUserMemoryStore(auth.userId)).load();
  return Response.json({ memories });
}

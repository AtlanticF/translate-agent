import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createD1SessionStore } from "./session-d1";
import type { SessionStore } from "./session";

export async function getSessionStore(): Promise<SessionStore> {
  const { env } = await getCloudflareContext({ async: true });
  return createD1SessionStore(env.DB);
}

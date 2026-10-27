import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authResult, resolveUserId, type AuthResult } from "./auth";

const jwtHeader = "Cf-Access-Jwt-Assertion";

export async function requireUserId(request: Request): Promise<AuthResult> {
  const context = await readCloudflareContext();
  const identity = await readIdentity(context?.ctx);

  return authResult(
    await resolveUserId({
      identity,
      token: request.headers.get(jwtHeader),
      devUserId: readString(context?.env, "DEV_USER_ID"),
      nodeEnv: readString(context?.env, "NODE_ENV") ?? process.env.NODE_ENV,
      teamDomain: readString(context?.env, "ACCESS_TEAM_DOMAIN"),
      aud: readString(context?.env, "ACCESS_AUD"),
    }),
  );
}

async function readCloudflareContext(): Promise<{ env: unknown; ctx: unknown } | undefined> {
  try {
    const context = await getCloudflareContext({ async: true });
    return { env: context.env, ctx: context.ctx };
  } catch {
    return undefined;
  }
}

async function readIdentity(ctx: unknown): Promise<unknown> {
  if (typeof ctx !== "object" || ctx === null) {
    return undefined;
  }
  const access = (ctx as { access?: { getIdentity?: () => Promise<unknown> } }).access;
  if (!access?.getIdentity) {
    return undefined;
  }
  try {
    return await access.getIdentity();
  } catch {
    return undefined;
  }
}

function readString(env: unknown, name: string): string | undefined {
  if (typeof env === "object" && env !== null) {
    const value = (env as Record<string, unknown>)[name];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

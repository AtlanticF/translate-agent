import { verifyAccessJwt } from "./access-jwt";

export type AuthResult = { userId: string } | { response: Response };

export function identityUserId(identity: unknown): string | undefined {
  if (typeof identity !== "object" || identity === null) {
    return undefined;
  }
  const record = identity as Record<string, unknown>;
  return nonEmpty(record.sub) ?? nonEmpty(record.user_uuid);
}

export async function resolveUserId(input: {
  identity?: unknown;
  token?: string | null;
  devUserId?: string;
  nodeEnv?: string;
  teamDomain?: string;
  aud?: string;
  verifyToken?: typeof verifyAccessJwt;
}): Promise<string | undefined> {
  const fromIdentity = identityUserId(input.identity);
  if (fromIdentity) {
    return fromIdentity;
  }

  const token = input.token?.trim();
  if (token && input.teamDomain && input.aud) {
    const verify = input.verifyToken ?? verifyAccessJwt;
    const fromToken = await verify(token, {
      teamDomain: input.teamDomain,
      aud: input.aud,
    });
    if (fromToken) {
      return fromToken;
    }
  }

  if (input.nodeEnv !== undefined && input.nodeEnv !== "production") {
    return nonEmpty(input.devUserId?.trim());
  }

  return undefined;
}

export function authResult(userId: string | undefined): AuthResult {
  return userId
    ? { userId }
    : { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

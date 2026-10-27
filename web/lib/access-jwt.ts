import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const jwksByTeamDomain = new Map<string, JWTVerifyGetKey>();

export async function verifyAccessJwt(
  token: string,
  options: { teamDomain: string; aud: string; jwks?: JWTVerifyGetKey },
): Promise<string | undefined> {
  const teamDomain = normalizeTeamDomain(options.teamDomain);
  const aud = options.aud.trim();
  if (!teamDomain || !aud) {
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, options.jwks ?? jwksFor(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience: aud,
    });
    return nonEmpty(payload.sub);
  } catch {
    return undefined;
  }
}

function normalizeTeamDomain(value: string): string | undefined {
  const domain = value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return domain.length > 0 ? domain : undefined;
}

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

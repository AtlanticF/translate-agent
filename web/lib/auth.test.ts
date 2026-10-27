import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { expect, test } from "vitest";
import { verifyAccessJwt } from "./access-jwt";
import { authResult, identityUserId, resolveUserId } from "./auth";

const teamDomain = "team.cloudflareaccess.com";
const audience = "aud-1";

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });

test("verifies an Access JWT and returns sub", async () => {
  const token = await signJwt();

  await expect(
    verifyAccessJwt(token, {
      teamDomain: `https://${teamDomain}/`,
      aud: audience,
      jwks,
    }),
  ).resolves.toBe("user-1");
});

test("rejects invalid Access JWTs", async () => {
  const other = await generateKeyPair("RS256");
  const wrongSignature = await signJwt({ key: other.privateKey });

  await expect(
    verifyAccessJwt(wrongSignature, { teamDomain, aud: audience, jwks }),
  ).resolves.toBeUndefined();
  await expect(
    verifyAccessJwt(await signJwt({ expiresIn: "-1m" }), { teamDomain, aud: audience, jwks }),
  ).resolves.toBeUndefined();
  await expect(
    verifyAccessJwt(await signJwt({ audience: "other" }), { teamDomain, aud: audience, jwks }),
  ).resolves.toBeUndefined();
  await expect(
    verifyAccessJwt(await signJwt({ issuer: "https://other.example" }), {
      teamDomain,
      aud: audience,
      jwks,
    }),
  ).resolves.toBeUndefined();
  await expect(
    verifyAccessJwt(await signJwt({ subject: "" }), { teamDomain, aud: audience, jwks }),
  ).resolves.toBeUndefined();
  await expect(
    verifyAccessJwt(await signJwt(), { teamDomain: "", aud: audience, jwks }),
  ).resolves.toBeUndefined();
  await expect(
    verifyAccessJwt(await signJwt(), { teamDomain, aud: "", jwks }),
  ).resolves.toBeUndefined();
});

test("reads sub or user_uuid from an Access identity", () => {
  expect(identityUserId({ sub: "user-1" })).toBe("user-1");
  expect(identityUserId({ sub: "", user_uuid: "user-2" })).toBe("user-2");
  expect(identityUserId({ user_uuid: "user-2" })).toBe("user-2");
  expect(identityUserId({ sub: 1, user_uuid: "user-2" })).toBe("user-2");
  expect(identityUserId({ sub: "" })).toBeUndefined();
  expect(identityUserId(null)).toBeUndefined();
  expect(identityUserId("user-1")).toBeUndefined();
});

test("resolves identity before JWT and dev user", async () => {
  const verify = async () => "jwt-user";

  await expect(
    resolveUserId({
      identity: { sub: "identity-user" },
      token: "token",
      teamDomain,
      aud: audience,
      verifyToken: verify,
      devUserId: "dev-user",
      nodeEnv: "development",
    }),
  ).resolves.toBe("identity-user");

  await expect(
    resolveUserId({
      token: "token",
      teamDomain,
      aud: audience,
      verifyToken: verify,
      devUserId: "dev-user",
      nodeEnv: "production",
    }),
  ).resolves.toBe("jwt-user");
});

test("uses the dev user only outside production", async () => {
  await expect(
    resolveUserId({ devUserId: "dev-user", nodeEnv: "development" }),
  ).resolves.toBe("dev-user");
  await expect(
    resolveUserId({ devUserId: "dev-user", nodeEnv: "production" }),
  ).resolves.toBeUndefined();
  await expect(resolveUserId({ devUserId: "dev-user" })).resolves.toBeUndefined();
  await expect(
    resolveUserId({ token: "bad", teamDomain, aud: audience, verifyToken: async () => undefined }),
  ).resolves.toBeUndefined();
});

test("maps missing users to a 401 response", async () => {
  expect(authResult("user-1")).toEqual({ userId: "user-1" });

  const result = authResult(undefined);
  expect("response" in result).toBe(true);
  if ("response" in result) {
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({ error: "unauthorized" });
  }
});

async function signJwt(options: {
  subject?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  key?: CryptoKey;
} = {}): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(options.subject ?? "user-1")
    .setIssuer(options.issuer ?? `https://${teamDomain}`)
    .setAudience(options.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(options.key ?? privateKey);
}

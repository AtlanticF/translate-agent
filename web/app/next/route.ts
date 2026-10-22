import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../../../src/env";
import { postNext, type NextTurnRequest } from "../../lib/next-turn";
import { getSessionStore } from "../../lib/session-cloudflare";

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");

export async function POST(request: Request) {
  loadEnvFile(envPath);
  const body = (await request.json()) as NextTurnRequest;
  const result = await postNext(body, request.signal, await getSessionStore());
  return Response.json(result.body, { status: result.status });
}

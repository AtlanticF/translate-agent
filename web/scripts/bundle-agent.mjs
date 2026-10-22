import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await esbuild.build({
  entryPoints: [path.resolve(appDir, "../src/application/session.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  outfile: path.join(appDir, "lib/agent-session.js"),
});

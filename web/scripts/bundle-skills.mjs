import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await esbuild.build({
  entryPoints: [path.resolve(appDir, "../src/skills/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  outfile: path.join(appDir, "lib/skills-core.js"),
});
